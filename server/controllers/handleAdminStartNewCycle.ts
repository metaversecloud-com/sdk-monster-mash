import { Request, Response } from "express";
import { KeyAssetDataObject, MonsterMashVisitorData } from "@shared/types/index.js";
import {
  computeLeaderboardForWinners,
  enqueueWinBannersByProfile,
  errorHandler,
  forceStartNewVoteCycle,
  getCredentials,
  getKeyAsset,
  getVisitor,
} from "@utils/index.js";

/**
 * POST /api/admin/vote/start-new-cycle
 *
 * Admin-only. Immediately closes the current vote cycle (same as the Sunday
 * rollover: crowns winners, appends to `storedWinners`, grants awards) and
 * opens a new cycle WITHIN the current submission window:
 *   - End date = this week's Saturday 23:59 ET (same as the weekly cycle).
 *   - Pool = current week's `eligibleMonsterIds` + backfill from older
 *     complete monsters if short of MIN.
 *   - Category = next in the rotation.
 *
 * All downstream side effects (latestAward stamping, leaderboard update,
 * win-banner fanout to peer contributors + caller) match what
 * `handleGetMainApp` does for the automatic Sunday rollover — just
 * triggered on-demand instead of waiting for the window to roll.
 */
export const handleAdminStartNewCycle = async (req: Request, res: Response) => {
  try {
    const source = req.body && req.body.interactiveNonce ? req.body : req.query;
    const credentials = getCredentials(source);
    const { profileId, sceneDropId, urlSlug } = credentials;

    const keyAsset = await getKeyAsset(credentials);
    const { visitor, isAdmin, visitorData } = await getVisitor(credentials, { shouldGetVisitorDetails: true });
    if (!isAdmin) return res.status(403).json({ success: false, message: "Admin only." });

    const dataObject = keyAsset.dataObject as KeyAssetDataObject;
    if (!dataObject.weeklyVotingEnabled) {
      return res.status(409).json({ success: false, message: "Weekly voting is off — turn it on first." });
    }

    const now = Date.now();
    const advance = forceStartNewVoteCycle(dataObject, now);

    // Short-circuit when the pool build didn't actually open a cycle —
    // forceStartNewVoteCycle returns a null currentVoteCycle when fewer
    // than MIN_POOL_SIZE_FOR_VOTE non-crowned monsters are reachable from
    // the current window + backfill. Writing `null` here would wipe the
    // existing cycle AND report success to the admin UI, which is how the
    // "started!" latch has been firing for failed starts.
    if (!advance.next.currentVoteCycle) {
      return res.status(409).json({
        success: false,
        message: "Not enough monsters available for a new vote cycle.",
      });
    }

    // The Gallery / Single Monster View ribbon comes straight off
    // `storedWinners[monsterId]` — no roster stamping needed. `advance`
    // already produced the keyed storedWinners update below.
    const nextMonsters = dataObject.monsters ?? {};

    // Build the single key-asset write — same shape as handleGetMainApp's
    // advance patch, minus the submission-window swap (window is unchanged).
    const nextPatch: Record<string, unknown> = {
      currentVoteCycle: advance.next.currentVoteCycle,
      storedWinners: advance.next.storedWinners,
      categorySchedule: advance.next.categorySchedule,
    };
    if (advance.freshlyCrownedWinners.length > 0) {
      nextPatch.leaderboard = computeLeaderboardForWinners({
        currentLeaderboard: dataObject.leaderboard,
        monsters: nextMonsters,
        freshlyCrowned: advance.freshlyCrownedWinners,
      });
    }

    await keyAsset.updateDataObject(nextPatch, {
      analytics: [
        {
          analyticName: "admin_force_new_cycle",
          profileId,
          urlSlug,
          uniqueKey: profileId,
        },
      ],
    });

    // Win-banner fanout — bucket by profileId so each peer takes a single
    // write even when they contributed to multiple winners. Caller's own
    // banners are stamped into their visitor data below.
    const bannersByPeer = new Map<
      string,
      Array<{ monsterId: string; category: string; place: 1 | 2 | 3; awardedAt: number }>
    >();
    const callerWinBanners: Array<{ monsterId: string; category: string; place: 1 | 2 | 3; awardedAt: number }> = [];
    for (const w of advance.freshlyCrownedWinners) {
      const entry = { monsterId: w.monsterId, category: w.category, place: w.place, awardedAt: w.awardedAt };
      for (const profileId of w.contributorProfileIds ?? []) {
        if (profileId === credentials.profileId) {
          callerWinBanners.push(entry);
        } else {
          const bucket = bannersByPeer.get(profileId) ?? [];
          bucket.push(entry);
          bannersByPeer.set(profileId, bucket);
        }
      }
    }
    if (bannersByPeer.size > 0) {
      await enqueueWinBannersByProfile(credentials, bannersByPeer, null).catch((error) =>
        errorHandler({
          error,
          functionName: "handleAdminStartNewCycle",
          message: "Non-fatal: win-banner fanout failed",
        }),
      );
    }
    if (callerWinBanners.length > 0) {
      const scopedKey = `${urlSlug}-${sceneDropId}`;
      const nextContributed = { ...(visitorData.contributedMonsters ?? {}) };
      for (const b of callerWinBanners) {
        const existing = nextContributed[b.monsterId];
        if (!existing) continue;
        const award = { category: b.category, place: b.place, awardedAt: b.awardedAt };
        const alreadyAwarded = (existing.awards ?? []).some(
          (a) => a.category === award.category && a.place === award.place,
        );
        if (!alreadyAwarded) {
          nextContributed[b.monsterId] = { ...existing, awards: [...(existing.awards ?? []), award] };
        }
      }
      const nextScoped: MonsterMashVisitorData = {
        ...visitorData,
        pendingWinBanners: [...(visitorData.pendingWinBanners ?? []), ...callerWinBanners],
        contributedMonsters: nextContributed,
      };
      const analytics = callerWinBanners.map((b) => ({
        analyticName: "award_won",
        profileId,
        urlSlug,
        uniqueKey: profileId,
      }));
      await visitor.updateDataObject({ [scopedKey]: nextScoped }, { analytics }).catch((error) =>
        errorHandler({
          error,
          functionName: "handleAdminStartNewCycle",
          message: "Non-fatal: caller win-banner write failed",
        }),
      );
    }

    return res.json({
      success: true,
      data: {
        cycle: advance.next.currentVoteCycle,
        freshlyCrownedCount: advance.freshlyCrownedWinners.length,
      },
    });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleAdminStartNewCycle",
      message: "Error starting a new vote cycle",
      req,
      res,
    });
  }
};
