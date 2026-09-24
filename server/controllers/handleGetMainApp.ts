import { Request, Response } from "express";
import { SECTION_LOCK_TTL_MS } from "@shared/content/monsterMash.js";
import { KeyAssetDataObject, MainAppResponseData, MonsterMashVisitorData } from "@shared/types/index.js";
import {
  advanceWeeklyCycle,
  buildClientPayload,
  computeLeaderboardForWinners,
  enqueueWinBannersByProfile,
  errorHandler,
  expireStaleLocks,
  getCredentials,
  getKeyAsset,
  getVisitor,
  refreshContent,
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
    const forceRefreshContent = req.query.forceRefreshContent === "true";

    const keyAsset = await getKeyAsset(credentials);
    const dataObject = keyAsset.dataObject as KeyAssetDataObject;

    // Compute every opportunistic mutation up front (advance weekly cycle,
    // stale-lock expiry, trophy leaderboard) and write them together in a
    // SINGLE `updateDataObject` call — per the "one write per controller per
    // dataObject" memory. Two separate writes would trigger lock contention
    // ("This data object is busy") on the SDK side.
    const now = Date.now();
    const advance = advanceWeeklyCycle(dataObject, now);

    // After the rollover, the monsters map is the same shape as before (advance
    // doesn't touch it). Run stale-lock expiry on that.
    const expiry = expireStaleLocks(dataObject.monsters, now);
    const monsters = expiry.monsters;

    const nextPatch: Record<string, unknown> = {};
    if (advance.changed) {
      nextPatch.currentSubmissionWindow = advance.next.currentSubmissionWindow;
      nextPatch.currentVoteCycle = advance.next.currentVoteCycle;
      nextPatch.storedWinners = advance.next.storedWinners;
      nextPatch.categorySchedule = advance.next.categorySchedule;
    }
    if (expiry.changed) {
      nextPatch.monsters = monsters;
    }
    if (advance.changed && advance.freshlyCrownedWinners.length > 0) {
      nextPatch.trophyLeaderboard = computeLeaderboardForWinners({
        currentLeaderboard: dataObject.trophyLeaderboard,
        monsters,
        freshlyCrowned: advance.freshlyCrownedWinners,
      });
    }

    if (Object.keys(nextPatch).length > 0) {
      await keyAsset.updateDataObject(nextPatch, {}).catch((error) =>
        errorHandler({
          error,
          functionName: "handleGetMainApp",
          message: "Non-fatal: could not persist opportunistic mutations",
        }),
      );
    }

    // Win-banner fanout — bucket banners by profileId first so each peer
    // visitor receives a SINGLE write even when they contributed to multiple
    // freshly-crowned winners. The caller's banners get merged into their
    // combined visitor write further down.
    const bannersByPeer = new Map<
      string,
      Array<{ monsterId: string; category: string; place: 1 | 2 | 3; awardedAt: number }>
    >();
    const callerWinBanners: Array<{ monsterId: string; category: string; place: 1 | 2 | 3; awardedAt: number }> = [];
    for (const w of advance.freshlyCrownedWinners) {
      const bannerEntry = {
        monsterId: w.monsterId,
        category: w.category,
        place: w.place,
        awardedAt: w.awardedAt,
      };
      for (const profileId of w.contributorProfileIds ?? []) {
        if (profileId === credentials.profileId) {
          callerWinBanners.push(bannerEntry);
        } else {
          const bucket = bannersByPeer.get(profileId) ?? [];
          bucket.push(bannerEntry);
          bannersByPeer.set(profileId, bucket);
        }
      }
    }
    if (bannersByPeer.size > 0) {
      await enqueueWinBannersByProfile(credentials, bannersByPeer, null).catch((error) =>
        errorHandler({
          error,
          functionName: "handleGetMainApp",
          message: "Non-fatal: win-banner fanout failed",
        }),
      );
    }

    // For the response, project the local `dataObject` with the same
    // opportunistic mutations so the caller sees consistent state without a
    // re-fetch.
    const effectiveDataObject: KeyAssetDataObject = advance.changed
      ? {
          ...dataObject,
          currentSubmissionWindow: advance.next.currentSubmissionWindow,
          currentVoteCycle: advance.next.currentVoteCycle,
          storedWinners: advance.next.storedWinners,
          categorySchedule: advance.next.categorySchedule,
          monsters,
        }
      : { ...dataObject, monsters };

    const { currentSubmissionWindow, currentVoteCycle, storedWinners, weeklyVotingEnabled } = effectiveDataObject;

    const { visitor, isAdmin, visitorData } = await getVisitor(credentials, {
      shouldGetVisitorDetails: true,
      forceRefreshInventory,
    });

    // Admin-only post-deploy trigger — bust the memoized parts catalog + walk
    // `client/public/parts/` (or `client/build/parts/` in prod) again. Non-
    // admins get the flag silently ignored so an accidental share of the URL
    // doesn't cost a disk scan. Same pattern as `forceRefreshInventory`.
    if (forceRefreshContent && isAdmin) refreshContent();

    // Single caller-visitor write: `daysAppOpened` bump + any win-banner
    // entries where the caller is a contributor + stale-activeDraft cleanup.
    // Skipped when nothing changed, so a plain re-open doesn't write.
    const today = new Date().toISOString().slice(0, 10);
    const days = visitorData.daysAppOpened ?? [];
    const daysChanged = !days.includes(today);

    // Stale-activeDraft detection.
    //
    // Clear the pointer when:
    //   - monster was evicted, completed, or the section is `done`
    //   - the section is locked to someone else
    //   - the section is `available` AND the draft is older than the
    //     lock TTL (30 min). The recent `expireStaleLocks` above flips a
    //     lapsed lock back to `available`; if the visitor's own draft has
    //     also aged out, treat it as gone. When the draft is still fresh
    //     but the roster reads `available` we DO NOT clear — that pattern
    //     shows up during the eventual-consistency window right after a
    //     claim, and the Join re-claim path heals it.
    let activeDraftShouldClear = false;
    if (visitorData.activeDraft) {
      const draft = visitorData.activeDraft;
      const draftMonster = monsters?.[draft.monsterId];
      const slot = draftMonster?.sections?.[draft.section];
      const monsterGone = !draftMonster;
      const monsterCompleted = draftMonster?.state === "complete";
      const sectionDone = slot?.status === "done";
      const sectionLockedByOther =
        slot?.status === "locked" && !!slot.contributorProfileId && slot.contributorProfileId !== credentials.profileId;
      const draftAgeMs = now - (draft.lockedAt ?? 0);
      const sectionAvailableAndDraftAged = slot?.status === "available" && draftAgeMs >= SECTION_LOCK_TTL_MS;
      if (monsterGone || monsterCompleted || sectionDone || sectionLockedByOther || sectionAvailableAndDraftAged) {
        activeDraftShouldClear = true;
      }
    }

    if (daysChanged || callerWinBanners.length > 0 || activeDraftShouldClear) {
      const nextDays = daysChanged ? [...days, today].slice(-365) : days;
      const nextPendingWin =
        callerWinBanners.length > 0
          ? [...(visitorData.pendingWinBanners ?? []), ...callerWinBanners]
          : visitorData.pendingWinBanners;
      const nextScoped: MonsterMashVisitorData = {
        ...visitorData,
        daysAppOpened: nextDays,
        pendingWinBanners: nextPendingWin ?? [],
      };
      if (activeDraftShouldClear) delete nextScoped.activeDraft;

      const scopedKey = `${credentials.urlSlug}-${credentials.sceneDropId}`;
      await visitor
        .updateDataObject(
          { [scopedKey]: nextScoped },
          daysChanged
            ? {
                analytics: [
                  {
                    analyticName: "app_opened",
                    profileId: credentials.profileId,
                    urlSlug: credentials.urlSlug,
                    uniqueKey: `${credentials.profileId}-${today}`,
                  },
                ],
              }
            : {},
        )
        .catch((error) =>
          errorHandler({ error, functionName: "handleGetMainApp", message: "Non-fatal: caller-visitor bump failed" }),
        );
      visitorData.daysAppOpened = nextDays;
      if (callerWinBanners.length > 0) visitorData.pendingWinBanners = nextPendingWin ?? [];
      if (activeDraftShouldClear) delete visitorData.activeDraft;
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
      contributedDrafts: visitorData.contributedDrafts,
      content: (() => {
        const c = buildClientPayload();
        return {
          categories: c.categories,
          layerOrder: c.layerOrder,
          parts: c.parts,
          loadedAt: c.loadedAt,
        };
      })(),
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
