import { Request, Response } from "express";
import { KeyAssetDataObject, MainAppResponseData, MonsterMashVisitorData } from "@shared/types/index.js";
import {
  advanceWeeklyCycle,
  enqueueWinBannersForProfiles,
  errorHandler,
  expireStaleLocks,
  getCredentials,
  getKeyAsset,
  getVisitor,
  updateLeaderboardForWinners,
} from "@utils/index.js";

/**
 * GET /api/main-app
 *
 * Response for the Monster Mash main modal. Initializes the key asset +
 * caller's visitor scoped data on first-open (both idempotent), then
 * returns:
 *   - Visitor summary (id, admin flag).
 *   - Roster snapshot (empty during Epic 1).
 *   - Current window / cycle / stored winners.
 *   - Banner bundle picked from the visitor's pending queues.
 *
 * Nothing here mutates roster/cycle state — those flow through
 * controllers unique to their epic. This controller is safe to call
 * from every tab (Create/Gallery/Vote) on every open.
 */
export const handleGetMainApp = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    const forceRefreshInventory = req.query.forceRefreshInventory === "true";

    const keyAsset = await getKeyAsset(credentials);
    let dataObject = keyAsset.dataObject as KeyAssetDataObject;

    // Opportunistic weekly rollover — if we've crossed into a new ET Sun→Sat
    // window since the last write, we close the prior cycle (crown winners),
    // roll the submission window, and open a fresh cycle when the pool is big
    // enough. Runs BEFORE the stale-lock expiry so both mutations share a
    // single persistence pass.
    const advance = advanceWeeklyCycle(dataObject, Date.now());
    if (advance.changed) {
      await keyAsset
        .updateDataObject(
          {
            currentSubmissionWindow: advance.next.currentSubmissionWindow,
            currentVoteCycle: advance.next.currentVoteCycle,
            storedWinners: advance.next.storedWinners,
            categorySchedule: advance.next.categorySchedule,
          },
          {},
        )
        .catch((error) =>
          errorHandler({
            error,
            functionName: "handleGetMainApp",
            message: "Non-fatal: could not persist weekly rollover",
          }),
        );
      await keyAsset.fetchDataObject();
      dataObject = keyAsset.dataObject as KeyAssetDataObject;

      // Fan out win banners to every contributor of each freshly crowned monster.
      for (const w of advance.freshlyCrownedWinners) {
        await enqueueWinBannersForProfiles(
          credentials,
          w.contributorProfileIds ?? [],
          { monsterId: w.monsterId, category: w.category, place: w.place, awardedAt: w.awardedAt },
          null, // no caller Visitor available yet; each profile handled via User class
        ).catch((error) =>
          errorHandler({
            error,
            functionName: "handleGetMainApp",
            message: "Non-fatal: win-banner enqueue failed",
          }),
        );
      }

      // Update the trophy leaderboard cache from the fresh winner batch.
      if (advance.freshlyCrownedWinners.length > 0) {
        await updateLeaderboardForWinners(keyAsset, {
          monsters: dataObject.monsters,
          freshlyCrowned: advance.freshlyCrownedWinners,
        }).catch((error) =>
          errorHandler({
            error,
            functionName: "handleGetMainApp",
            message: "Non-fatal: trophy leaderboard update failed",
          }),
        );
      }
    }

    const { currentSubmissionWindow, currentVoteCycle, storedWinners, weeklyVotingEnabled } = dataObject;

    // Opportunistic 30-min stale-lock expiry — if any slots flip back to
    // `available`, persist before surfacing state to the caller. Best-effort:
    // a lock collision here just means the next reader retries.
    const expiry = expireStaleLocks(dataObject.monsters, Date.now());
    const monsters = expiry.monsters;
    if (expiry.changed) {
      await keyAsset
        .updateDataObject({ monsters }, {})
        .catch((error) =>
          errorHandler({
            error,
            functionName: "handleGetMainApp",
            message: "Non-fatal: could not persist stale-lock expiry",
          }),
        );
    }

    const { visitor, isAdmin, visitorData } = await getVisitor(credentials, {
      shouldGetVisitorDetails: true,
      forceRefreshInventory,
    });

    // Track daysAppOpened for the Masher visit-badge tiers.
    const today = new Date().toISOString().slice(0, 10);
    const days = visitorData.daysAppOpened ?? [];
    if (!days.includes(today)) {
      const nextDays = [...days, today].slice(-365);
      const nextScoped: MonsterMashVisitorData = { ...visitorData, daysAppOpened: nextDays };
      const scopedKey = `${credentials.urlSlug}-${credentials.sceneDropId}`;
      await visitor
        .updateDataObject(
          { [scopedKey]: nextScoped },
          {
            analytics: [
              {
                analyticName: "app_opened",
                profileId: credentials.profileId,
                urlSlug: credentials.urlSlug,
                uniqueKey: `${credentials.profileId}-${today}`,
              },
            ],
          },
        )
        .catch((error) =>
          errorHandler({ error, functionName: "handleGetMainApp", message: "Non-fatal: daysAppOpened bump failed" }),
        );
      visitorData.daysAppOpened = nextDays;
    }

    const rosterEntries = Object.values(monsters ?? {});
    const pendingWinBanners = visitorData.pendingWinBanners ?? [];
    const pendingCompletionBanners = visitorData.pendingCompletionBanners ?? [];

    const winTop = pendingWinBanners[pendingWinBanners.length - 1] ?? null;
    const winMonster = winTop ? monsters?.[winTop.monsterId] : undefined;
    const completionTop = pendingCompletionBanners[pendingCompletionBanners.length - 1] ?? null;

    const payload: MainAppResponseData = {
      visitor: {
        visitorId: credentials.visitorId,
        profileId: credentials.profileId,
        displayName: credentials.displayName,
        isAdmin,
      },
      weeklyVotingEnabled,
      monsters: rosterEntries,
      currentSubmissionWindow,
      currentVoteCycle,
      storedWinners: storedWinners ?? [],
      banners: {
        win: winTop
          ? {
              monsterId: winTop.monsterId,
              monsterName: winMonster?.name ?? "",
              category: winTop.category,
              place: winTop.place,
              awardedAt: winTop.awardedAt,
            }
          : null,
        completion: completionTop,
        hasActiveVoteCycle: !!currentVoteCycle,
        hasNextCategoryReminder: !currentVoteCycle && weeklyVotingEnabled,
      },
      pendingWinBanners: pendingWinBanners.map((b) => ({
        monsterId: b.monsterId,
        monsterName: monsters?.[b.monsterId]?.name ?? "",
        category: b.category,
        place: b.place,
        awardedAt: b.awardedAt,
      })),
      pendingCompletionBanners,
      activeDraft: visitorData.activeDraft,
    };

    // Silence unused-var lint until controllers actually mutate on this call.
    void visitor;

    return res.json({ success: true, data: payload });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleGetMainApp",
      message: "Error loading Monster Mash main app state",
      req,
      res,
    });
  }
};
