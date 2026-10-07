import { Request, Response } from "express";
import { SECTION_LOCK_TTL_MS } from "@shared/content/monsterMash.js";
import { Credentials } from "../types/index.js";
import {
  KeyAssetDataObject,
  MainAppResponseData,
  MonsterMashVisitorData,
  Section,
  SECTIONS,
  VisitorDataObjectType,
} from "@shared/types/index.js";
import {
  advanceWeeklyCycle,
  buildClientPayload,
  computeLeaderboardForWinners,
  enqueueWinBannersByProfile,
  errorHandler,
  evictOrphanInProgressMonsters,
  expireStaleLocks,
  getCredentials,
  getKeyAsset,
  getVisitor,
  refreshContent,
  syncBadges,
  User,
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
 * Nothing here mutates roster/cycle state - those flow through
 * controllers unique to their epic. This controller is safe to call
 * from every tab (Create/Gallery/Vote) on every open.
 */
export const handleGetMainApp = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    const { displayName, profileId, sceneDropId, urlSlug, visitorId } = credentials;

    const forceRefreshInventory = req.query.forceRefreshInventory === "true";
    const forceRefreshContent = req.query.forceRefreshContent === "true";

    const keyAsset = await getKeyAsset(credentials);
    const dataObject = keyAsset.dataObject as KeyAssetDataObject;

    // Compute every opportunistic mutation up front (advance weekly cycle,
    // stale-lock expiry, trophy leaderboard) and write them together in a
    // SINGLE `updateDataObject` call - per the "one write per controller per
    // dataObject" memory. Two separate writes would trigger lock contention
    // ("This data object is busy") on the SDK side.
    const now = Date.now();
    const advance = advanceWeeklyCycle(dataObject, now);

    // After the rollover, the monsters map is the same shape as before (advance
    // doesn't touch it). Run stale-lock expiry on that.
    const expiry = expireStaleLocks(dataObject.monsters, now);
    let monsters = expiry.monsters;
    let monstersChanged = expiry.changed;

    // Reap orphan in-progress monsters — all-slots-available, no contributors,
    // idle past the section-lock TTL. Runs AFTER expireStaleLocks so slots
    // that just aged out of `locked` factor in. Keeps the Create tab from
    // filling up with ghosts after abandoned starts.
    const orphanSweep = evictOrphanInProgressMonsters(monsters, now);
    if (orphanSweep.changed) {
      monsters = orphanSweep.monsters;
      monstersChanged = true;
    }

    // The Gallery / Single Monster View ribbon comes straight off
    // `storedWinners[monsterId]` — no roster stamping needed. `advance`
    // already wrote the keyed storedWinners map; nothing extra to do here
    // for the "Show only winners" filter to light up.
    const nextPatch: Record<string, unknown> = {};
    if (advance.changed) {
      nextPatch.currentSubmissionWindow = advance.next.currentSubmissionWindow;
      nextPatch.currentVoteCycle = advance.next.currentVoteCycle;
      nextPatch.storedWinners = advance.next.storedWinners;
      nextPatch.categorySchedule = advance.next.categorySchedule;
    }
    if (monstersChanged) {
      nextPatch.monsters = monsters;
    }
    if (advance.changed && advance.freshlyCrownedWinners.length > 0) {
      nextPatch.leaderboard = computeLeaderboardForWinners({
        currentLeaderboard: dataObject.leaderboard,
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

    // Win-banner fanout - bucket banners by profileId first so each peer
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

    const { currentSubmissionWindow, currentVoteCycle, weeklyVotingEnabled, categorySchedule } = effectiveDataObject;

    const { visitor, isAdmin, visitorData, visitorInventory } = await getVisitor(credentials, {
      shouldGetVisitorDetails: true,
      includeInventory: true,
      forceRefreshInventory,
    });

    // Admin-only post-deploy trigger - bust the memoized parts catalog + walk
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
    //     but the roster reads `available` we DO NOT clear - that pattern
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
        slot?.status === "locked" && !!slot.contributorProfileId && slot.contributorProfileId !== profileId;
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

      // Also stamp each new win onto the caller's contributedMonsters[id].awards
      // so the Gallery's "mine + winners" filter surfaces evicted own-winners
      // (that path uses contribEntry.awards[0] when the roster entry is gone).
      // Peers get the same treatment inside enqueueWinBannersByProfile above.
      let nextContributed = visitorData.contributedMonsters;
      if (callerWinBanners.length > 0) {
        const draft = { ...(visitorData.contributedMonsters ?? {}) };
        for (const b of callerWinBanners) {
          const existing = draft[b.monsterId];
          if (!existing) continue;
          const award = { category: b.category, place: b.place, awardedAt: b.awardedAt };
          const alreadyAwarded = (existing.awards ?? []).some(
            (a) => a.category === award.category && a.place === award.place,
          );
          if (!alreadyAwarded) {
            draft[b.monsterId] = { ...existing, awards: [...(existing.awards ?? []), award] };
          }
        }
        nextContributed = draft;
      }

      const nextScoped: MonsterMashVisitorData = {
        ...visitorData,
        daysAppOpened: nextDays,
        pendingWinBanners: nextPendingWin ?? [],
        contributedMonsters: nextContributed ?? {},
      };
      if (activeDraftShouldClear) delete nextScoped.activeDraft;

      const scopedKey = `${urlSlug}-${sceneDropId}`;
      // Combine every analytic that lives on this write: today's `app_opened`
      // (when crossing an ET-day) and one `award_won` per freshly-crowned
      // winner the CALLER contributed to. Peers' award_won fire inside
      // enqueueWinBannersByProfile above, so this covers the one path that
      // doesn't go through that util.
      const analytics: Array<{ analyticName: string; profileId: string; urlSlug: string; uniqueKey: string }> = [];
      if (daysChanged) {
        analytics.push({
          analyticName: "app_opened",
          profileId,
          urlSlug,
          uniqueKey: profileId,
        });
      }
      for (const b of callerWinBanners) {
        analytics.push({
          analyticName: "award_won",
          profileId,
          urlSlug,
          uniqueKey: profileId,
        });
      }
      await visitor
        .updateDataObject({ [scopedKey]: nextScoped }, analytics.length > 0 ? { analytics } : {})
        .catch((error) =>
          errorHandler({ error, functionName: "handleGetMainApp", message: "Non-fatal: caller-visitor bump failed" }),
        );
      visitorData.daysAppOpened = nextDays;
      if (callerWinBanners.length > 0) {
        visitorData.pendingWinBanners = nextPendingWin ?? [];
        visitorData.contributedMonsters = nextContributed ?? {};
      }
      if (activeDraftShouldClear) delete visitorData.activeDraft;
    }

    // Badge grant pass. Runs after the visitor write above so this open's
    // own `daysAppOpened` bump and any freshly-stamped award ribbons are
    // already counted. Everything the rules read lives on the caller's own
    // visitor dataObject, so each contributor picks up their badges on
    // their next open — matching the spec's "first time a player opens the
    // app after their monster won" model, with no cross-profile fanout.
    await syncBadges({
      credentials,
      visitor,
      visitorData,
      ownedBadgeNames: new Set(Object.keys(visitorInventory ?? {})),
      forceRefreshInventory,
    });

    const rosterEntries = Object.values(monsters ?? {});
    const pendingWinBanners = visitorData.pendingWinBanners ?? [];
    const pendingCompletionBanners = visitorData.pendingCompletionBanners ?? [];

    const winTop = pendingWinBanners[pendingWinBanners.length - 1] ?? null;
    const winMonster = winTop ? monsters?.[winTop.monsterId] : undefined;
    const completionTop = pendingCompletionBanners[pendingCompletionBanners.length - 1] ?? null;

    const payload: MainAppResponseData = {
      visitor: {
        visitorId,
        profileId,
        displayName,
        isAdmin,
      },
      weeklyVotingEnabled,
      monsters: rosterEntries,
      currentSubmissionWindow,
      currentVoteCycle,
      categorySchedule: categorySchedule ?? { orderIds: [], nextIndex: 0 },
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
      // Enrich the caller's own `contributedDrafts` with picks from PEER-
      // owned done sections on in-progress monsters where the caller has
      // already contributed. The client renders a layered preview for every
      // slot that has picks, so stamping peer picks here lifts the mask on
      // peer sections for contributors — matches the "once you've submitted,
      // you see what's been built" UX. Non-contributors still see the
      // masked placeholder (we only enrich monsters where the caller is in
      // `contributorProfileIds`). Enrichment is response-only; nothing is
      // written back to the caller's visitor data.
      contributedDrafts: await enrichDraftsWithPeerPicks({
        callerDrafts: visitorData.contributedDrafts,
        callerProfileId: profileId,
        credentials,
        monsters,
      }),
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

/**
 * For each in-progress monster where the caller contributes AND a PEER has
 * also done a section, fetch the peer's `contributedDrafts[monsterId][section]`
 * and merge it into the caller's drafts in-memory. The client reads these as
 * if they were the caller's own, which lets `SectionLayeredImage` render for
 * every done slot once the caller has submitted their part.
 *
 * Scope guard: only touches in-progress monsters the caller is a contributor
 * on. Complete monsters have no `contributedDrafts` anywhere (they're
 * cleaned up at finalize), and non-contributor callers see the masked view
 * exactly like before.
 *
 * Cost: one `User.create + fetchDataObject` per UNIQUE peer we need picks
 * from, fired in parallel. A peer who contributed to multiple in-progress
 * monsters (same person on two of the caller's monsters) is still fetched
 * exactly once — we collect every peerId needed up front, dedupe via a
 * `Set`, and `Promise.all` the fetches before the merge pass.
 */
const enrichDraftsWithPeerPicks = async ({
  callerDrafts,
  callerProfileId,
  credentials,
  monsters,
}: {
  callerDrafts: MonsterMashVisitorData["contributedDrafts"];
  callerProfileId: string;
  credentials: Credentials;
  monsters: KeyAssetDataObject["monsters"];
}): Promise<MonsterMashVisitorData["contributedDrafts"]> => {
  const drafts: NonNullable<MonsterMashVisitorData["contributedDrafts"]> = { ...(callerDrafts ?? {}) };
  const scopedKey = `${credentials.urlSlug}-${credentials.sceneDropId}`;

  // Pass 1 — walk the roster once and record every (monsterId, section,
  // peerProfileId) tuple we need picks for. Also build the unique set of
  // peer ids so we fetch each peer's visitor data exactly once.
  type NeededPick = { monsterId: string; section: Section; peerProfileId: string };
  const needed: NeededPick[] = [];
  const uniquePeerIds = new Set<string>();
  for (const [monsterId, entry] of Object.entries(monsters ?? {})) {
    if (!entry || entry.state !== "in-progress") continue;
    if (!(entry.contributorProfileIds ?? []).includes(callerProfileId)) continue;
    for (const section of SECTIONS) {
      const slot = entry.sections?.[section];
      if (!slot || slot.status !== "done") continue;
      if (!slot.contributorProfileId || slot.contributorProfileId === callerProfileId) continue;
      // Already have picks for this slot in the caller's drafts (unusual but
      // possible from a race) — don't clobber.
      if (drafts[monsterId]?.[section]?.picks) continue;
      needed.push({ monsterId, section, peerProfileId: slot.contributorProfileId });
      uniquePeerIds.add(slot.contributorProfileId);
    }
  }
  if (uniquePeerIds.size === 0) return drafts;

  // Pass 2 — fetch every unique peer in PARALLEL (one SDK round trip per
  // peer, all in flight at once instead of serialized).
  const peerFetches = await Promise.all(
    [...uniquePeerIds].map(async (peerProfileId) => {
      try {
        const peerUser = User.create({
          profileId: peerProfileId,
          credentials: { ...credentials, profileId: peerProfileId },
        });
        const raw = ((await peerUser.fetchDataObject()) || {}) as VisitorDataObjectType;
        const scoped = (raw[scopedKey] as MonsterMashVisitorData | undefined) ?? null;
        return [peerProfileId, scoped] as const;
      } catch (error) {
        console.warn(`enrichDraftsWithPeerPicks: could not fetch peer ${peerProfileId}`, error);
        return [peerProfileId, null] as const;
      }
    }),
  );
  const peerCache = new Map(peerFetches);

  // Pass 3 — merge each needed tuple's picks into the caller's drafts.
  for (const { monsterId, section, peerProfileId } of needed) {
    const peerDraft = peerCache.get(peerProfileId)?.contributedDrafts?.[monsterId]?.[section];
    if (!peerDraft?.picks) continue;
    drafts[monsterId] = {
      ...(drafts[monsterId] ?? {}),
      [section]: { picks: peerDraft.picks, nameToken: peerDraft.nameToken ?? "" },
    };
  }

  return drafts;
};
