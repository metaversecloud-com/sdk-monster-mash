import { MIN_POOL_SIZE_FOR_VOTE, STORED_WINNERS_MAX, VOTING_CATEGORY_BY_ID } from "@shared/content/monsterMash.js";
import { KeyAssetDataObject, Place, StoredWinner, SubmissionWindow, VoteCycle } from "@shared/types/index.js";
import { computeWinners } from "./computeWinners.js";
import { currentSubmissionWindow } from "./computeWindows.js";

export interface WeeklyAdvanceResult {
  next: {
    currentSubmissionWindow: SubmissionWindow;
    currentVoteCycle: VoteCycle | null;
    storedWinners: StoredWinner[];
    categorySchedule: KeyAssetDataObject["categorySchedule"];
  };
  changed: boolean;
  /** Winners just crowned (empty when no cycle closed this call). */
  freshlyCrownedWinners: StoredWinner[];
}

/**
 * Opportunistic weekly transition. Called from `handleGetMainApp` on every
 * open — if we've crossed into a new ET week since the last write, we:
 *
 *   1. Close the current submission window (freeze `eligibleMonsterIds`).
 *   2. Close the current vote cycle (if any) — compute top-3 winners,
 *      append to storedWinners, tell caller so the finalize side can
 *      grant badges + enqueue banners.
 *   3. Open the new submission window for the week we've just entered.
 *   4. Build the next cycle's pool:
 *        a. Start with the previous window's `eligibleMonsterIds` (fresh
 *           submissions from the week that just ended).
 *        b. If that's short of `MIN_POOL_SIZE_FOR_VOTE`, backfill from
 *           older complete monsters sorted by (least `timesShown` first,
 *           most recent `birthdate` as tiebreak). Winners and already-
 *           pooled monsters are excluded. Takes as many as needed to hit
 *           MIN; stops short if there aren't that many eligible.
 *        c. Open the cycle with that pool if we hit MIN, else skip.
 *   5. If no cycle opened, carry the previous window's `eligibleMonsterIds`
 *      forward into the new submission window (spec: "Entered in the next
 *      vote — if enough are finished — otherwise the one after"). Winners
 *      and admin-deleted monsters are stripped from the carry.
 *
 * Idempotent — if we're still in the same window, returns `changed: false`.
 */
export const advanceWeeklyCycle = (
  keyAssetDataObject: KeyAssetDataObject,
  now: number = Date.now(),
): WeeklyAdvanceResult => {
  const activeWindow = keyAssetDataObject.currentSubmissionWindow;
  const nowWindow = currentSubmissionWindow(now);
  const alreadyCurrent = activeWindow?.windowId === nowWindow.windowId;
  const weeklyVotingEnabled = keyAssetDataObject.weeklyVotingEnabled;

  if (alreadyCurrent) {
    return {
      next: {
        currentSubmissionWindow: activeWindow,
        currentVoteCycle: keyAssetDataObject.currentVoteCycle ?? null,
        storedWinners: keyAssetDataObject.storedWinners ?? [],
        categorySchedule: keyAssetDataObject.categorySchedule ?? { orderIds: [], nextIndex: 0 },
      },
      changed: false,
      freshlyCrownedWinners: [],
    };
  }

  // Step 1 + 2: close the previous week.
  const previousWindow = activeWindow;
  const previousCycle = keyAssetDataObject.currentVoteCycle ?? null;

  let freshlyCrownedWinners: StoredWinner[] = [];
  let updatedStoredWinners = [...(keyAssetDataObject.storedWinners ?? [])];

  if (previousCycle && weeklyVotingEnabled) {
    // Build birthdates map so ties break by earliest.
    const birthdates = new Map<string, number>();
    const monsters = keyAssetDataObject.monsters ?? {};
    for (const [id, entry] of Object.entries(monsters)) {
      if (entry?.birthdate) birthdates.set(id, entry.birthdate);
    }
    const excluded = new Set((keyAssetDataObject.storedWinners ?? []).map((w) => w.monsterId));

    const winners = computeWinners(previousCycle, birthdates, excluded);
    freshlyCrownedWinners = winners.map((w) => {
      const entry = monsters[w.monsterId];
      const stored: StoredWinner = {
        monsterId: w.monsterId,
        category: previousCycle.category,
        place: w.place as Place,
        awardedAt: now,
        contributorProfileIds: entry?.contributorProfileIds ?? [],
        snapshotName: entry?.name,
        snapshotImageUrl: entry?.imageUrl,
      };
      return stored;
    });

    updatedStoredWinners = [...updatedStoredWinners, ...freshlyCrownedWinners];
    // Trim to STORED_WINNERS_MAX (rolling window).
    if (updatedStoredWinners.length > STORED_WINNERS_MAX) {
      updatedStoredWinners = updatedStoredWinners.slice(-STORED_WINNERS_MAX);
    }
  }

  // Step 3: open a new submission window (already computed).
  const nextSubmissionWindow: SubmissionWindow = { ...nowWindow };

  // Step 4: build the pool for the next vote cycle. Start with the fresh
  // submissions, then (if short) backfill from older complete monsters to
  // reach quorum.
  const prevEligible = previousWindow?.eligibleMonsterIds ?? [];
  const monstersRoster = keyAssetDataObject.monsters ?? {};
  const alreadyCrownedIds = new Set(updatedStoredWinners.map((w) => w.monsterId));
  let nextCategoryIndex = keyAssetDataObject.categorySchedule?.nextIndex ?? 0;
  const categoryOrder = keyAssetDataObject.categorySchedule?.orderIds ?? [];
  let nextVoteCycle: VoteCycle | null = null;

  if (weeklyVotingEnabled && categoryOrder.length > 0) {
    const pool: string[] = prevEligible.filter((id) => {
      const entry = monstersRoster[id];
      return !!entry && entry.state === "complete" && !alreadyCrownedIds.has(id);
    });

    // Short pool → backfill from older complete monsters, prioritized by
    // least `timesShown` (zero-shown first), tiebreak by most recent
    // birthdate (newer first). Skips winners, deletions, and anything we've
    // already got in the pool.
    if (pool.length < MIN_POOL_SIZE_FOR_VOTE) {
      const alreadyPooled = new Set(pool);
      const backfillCandidates = Object.values(monstersRoster)
        .filter(
          (entry): entry is NonNullable<typeof entry> =>
            !!entry &&
            entry.state === "complete" &&
            !alreadyCrownedIds.has(entry.monsterId) &&
            !alreadyPooled.has(entry.monsterId),
        )
        .sort((a, b) => {
          const aShown = a.timesShown ?? 0;
          const bShown = b.timesShown ?? 0;
          if (aShown !== bShown) return aShown - bShown; // asc: fewest shown first
          const aBirth = a.birthdate ?? 0;
          const bBirth = b.birthdate ?? 0;
          return bBirth - aBirth; // desc: newest first
        });

      const needed = MIN_POOL_SIZE_FOR_VOTE - pool.length;
      for (const entry of backfillCandidates.slice(0, needed)) {
        pool.push(entry.monsterId);
      }
    }

    if (pool.length >= MIN_POOL_SIZE_FOR_VOTE) {
      const categoryId = categoryOrder[nextCategoryIndex % categoryOrder.length];
      // Skip categories the schedule points at that no longer exist.
      if (VOTING_CATEGORY_BY_ID[categoryId]) {
        nextVoteCycle = {
          cycleId: `${nowWindow.windowId}-vote`,
          category: categoryId,
          startAt: nowWindow.startAt,
          endAt: nowWindow.endAt,
          poolMonsterIds: pool,
          tallies: {},
          totalMatchupsServed: 0,
        };
        nextCategoryIndex = (nextCategoryIndex + 1) % categoryOrder.length;
      }
    }
  }

  // Step 5: carry over any unvoted-on fresh submissions into the new window.
  // A completed monster that missed its shot at a vote (previous window was
  // short of MIN even after backfill, or weekly voting was off) rolls forward
  // and keeps accumulating with next week's finalizes until a pool reaches
  // quorum. Without this carry-over, the Vote tab reports "0 of 10 in the
  // pool" every Sunday even when the Gallery shows a stack of finished
  // monsters. Monsters that just went INTO the vote cycle above are not
  // carried; monsters already crowned in `storedWinners` are filtered out so
  // they can't re-enter a future pool. Missing roster entries (evicted or
  // admin-deleted) are dropped too. (The backfilled OLD monsters stay in the
  // roster and will be considered again next advance — no need to shove them
  // into the submission window.)
  if (!nextVoteCycle) {
    const carriedOver = prevEligible.filter((id) => {
      const entry = monstersRoster[id];
      return !!entry && entry.state === "complete" && !alreadyCrownedIds.has(id);
    });
    if (carriedOver.length > 0) {
      nextSubmissionWindow.eligibleMonsterIds = [...carriedOver];
    }
  }

  return {
    next: {
      currentSubmissionWindow: nextSubmissionWindow,
      currentVoteCycle: nextVoteCycle,
      storedWinners: updatedStoredWinners,
      categorySchedule: {
        orderIds: categoryOrder,
        nextIndex: nextCategoryIndex,
      },
    },
    changed: true,
    freshlyCrownedWinners,
  };
};

/**
 * Admin-triggered "start a new vote cycle NOW" transition. Reuses the same
 * close + pool-build + open logic as the weekly rollover, but WITHIN the
 * current submission window (doesn't roll to a new week):
 *
 *   - Closes the current cycle (if any), computes top-3 winners, appends
 *     to `storedWinners` — identical to the automatic Sunday rollover.
 *   - Keeps the current submission window intact: its `eligibleMonsterIds`
 *     survive and are used as the pool source for the new cycle.
 *   - Backfills from older complete monsters when the eligible list is
 *     short of MIN (same algorithm as the weekly rollover).
 *   - End date = current window's `endAt` (upcoming Sat 23:59 ET — same
 *     deadline as a cycle opened by the weekly rollover would carry).
 *   - Advances `categorySchedule.nextIndex` so the new cycle picks the
 *     NEXT category in rotation.
 *   - CycleId suffixed with the timestamp so it doesn't collide with the
 *     cycle we just closed (vote-count accounting on the client keys on
 *     cycleId; new id resets counters cleanly).
 *
 * Returns `WeeklyAdvanceResult`-shaped output so callers can run the same
 * side-effect fanout (stamp `latestAward`, update leaderboard, enqueue win
 * banners) as `handleGetMainApp` does for the automatic path.
 */
export const forceStartNewVoteCycle = (
  keyAssetDataObject: KeyAssetDataObject,
  now: number = Date.now(),
): WeeklyAdvanceResult => {
  const activeWindow = keyAssetDataObject.currentSubmissionWindow ?? currentSubmissionWindow(now);
  const previousCycle = keyAssetDataObject.currentVoteCycle ?? null;
  const weeklyVotingEnabled = keyAssetDataObject.weeklyVotingEnabled;

  let freshlyCrownedWinners: StoredWinner[] = [];
  let updatedStoredWinners = [...(keyAssetDataObject.storedWinners ?? [])];

  // Close the current cycle (if any) — same winner-crowning logic as the
  // automatic rollover.
  if (previousCycle && weeklyVotingEnabled) {
    const birthdates = new Map<string, number>();
    const monsters = keyAssetDataObject.monsters ?? {};
    for (const [id, entry] of Object.entries(monsters)) {
      if (entry?.birthdate) birthdates.set(id, entry.birthdate);
    }
    const excluded = new Set((keyAssetDataObject.storedWinners ?? []).map((w) => w.monsterId));
    const winners = computeWinners(previousCycle, birthdates, excluded);
    freshlyCrownedWinners = winners.map((w) => {
      const entry = monsters[w.monsterId];
      const stored: StoredWinner = {
        monsterId: w.monsterId,
        category: previousCycle.category,
        place: w.place as Place,
        awardedAt: now,
        contributorProfileIds: entry?.contributorProfileIds ?? [],
        snapshotName: entry?.name,
        snapshotImageUrl: entry?.imageUrl,
      };
      return stored;
    });
    updatedStoredWinners = [...updatedStoredWinners, ...freshlyCrownedWinners];
    if (updatedStoredWinners.length > STORED_WINNERS_MAX) {
      updatedStoredWinners = updatedStoredWinners.slice(-STORED_WINNERS_MAX);
    }
  }

  // Build the pool from the CURRENT window's eligible IDs (plus backfill).
  const monstersRoster = keyAssetDataObject.monsters ?? {};
  const alreadyCrownedIds = new Set(updatedStoredWinners.map((w) => w.monsterId));
  const currentEligible = activeWindow?.eligibleMonsterIds ?? [];
  let nextCategoryIndex = keyAssetDataObject.categorySchedule?.nextIndex ?? 0;
  const categoryOrder = keyAssetDataObject.categorySchedule?.orderIds ?? [];
  let nextVoteCycle: VoteCycle | null = null;

  if (weeklyVotingEnabled && categoryOrder.length > 0) {
    const pool: string[] = currentEligible.filter((id) => {
      const entry = monstersRoster[id];
      return !!entry && entry.state === "complete" && !alreadyCrownedIds.has(id);
    });
    if (pool.length < MIN_POOL_SIZE_FOR_VOTE) {
      const alreadyPooled = new Set(pool);
      const backfillCandidates = Object.values(monstersRoster)
        .filter(
          (entry): entry is NonNullable<typeof entry> =>
            !!entry &&
            entry.state === "complete" &&
            !alreadyCrownedIds.has(entry.monsterId) &&
            !alreadyPooled.has(entry.monsterId),
        )
        .sort((a, b) => {
          const aShown = a.timesShown ?? 0;
          const bShown = b.timesShown ?? 0;
          if (aShown !== bShown) return aShown - bShown;
          const aBirth = a.birthdate ?? 0;
          const bBirth = b.birthdate ?? 0;
          return bBirth - aBirth;
        });
      const needed = MIN_POOL_SIZE_FOR_VOTE - pool.length;
      for (const entry of backfillCandidates.slice(0, needed)) {
        pool.push(entry.monsterId);
      }
    }

    if (pool.length >= MIN_POOL_SIZE_FOR_VOTE) {
      const categoryId = categoryOrder[nextCategoryIndex % categoryOrder.length];
      if (VOTING_CATEGORY_BY_ID[categoryId]) {
        nextVoteCycle = {
          // Suffix with `now` so the new cycleId doesn't collide with the
          // one we just closed (vote counts key on cycleId → clean reset).
          cycleId: `${activeWindow.windowId}-vote-${now}`,
          category: categoryId,
          startAt: now,
          endAt: activeWindow.endAt,
          poolMonsterIds: pool,
          tallies: {},
          totalMatchupsServed: 0,
        };
        nextCategoryIndex = (nextCategoryIndex + 1) % categoryOrder.length;
      }
    }
  }

  return {
    next: {
      currentSubmissionWindow: activeWindow,
      currentVoteCycle: nextVoteCycle,
      storedWinners: updatedStoredWinners,
      categorySchedule: {
        orderIds: categoryOrder,
        nextIndex: nextCategoryIndex,
      },
    },
    changed: true,
    freshlyCrownedWinners,
  };
};
