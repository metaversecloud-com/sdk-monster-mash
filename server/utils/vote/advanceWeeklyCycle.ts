import {
  MIN_POOL_SIZE_FOR_VOTE,
  STORED_WINNERS_MAX,
  VOTING_CATEGORIES,
  WINNER_COOLDOWN_MS,
} from "@shared/content/monsterMash.js";
import {
  KeyAssetDataObject,
  MonsterIndexEntry,
  Place,
  StoredWinner,
  SubmissionWindow,
  VoteCycle,
} from "@shared/types/index.js";
import { computeWinners } from "./computeWinners.js";
import { currentSubmissionWindow } from "./computeWindows.js";

/**
 * In-memory award record for a monster that was just crowned. Not what we
 * STORE (that's the leaner `StoredWinner` on the key asset) — it carries
 * monsterId + contributorProfileIds because the banner-fanout side needs
 * them, and reading them from the roster at fanout time is a little nicer
 * than passing a second parameter through four controllers.
 */
export interface FreshlyCrownedWinner {
  monsterId: string;
  category: string;
  place: Place;
  awardedAt: number;
  contributorProfileIds: string[];
}

export interface WeeklyAdvanceResult {
  next: {
    currentSubmissionWindow: SubmissionWindow;
    currentVoteCycle: VoteCycle | null;
    storedWinners: { [monsterId: string]: StoredWinner };
    categoryNextIndex: KeyAssetDataObject["categoryNextIndex"];
  };
  changed: boolean;
  /** Winners just crowned (empty when no cycle closed this call). */
  freshlyCrownedWinners: FreshlyCrownedWinner[];
}

type MonsterRoster = { [monsterId: string]: MonsterIndexEntry };
type StoredWinnersMap = { [monsterId: string]: StoredWinner };

// ─────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Trim a storedWinners map to the newest `max` entries by `awardedAt`.
 * Sorted-oldest-first eviction so the Vote tab's "last 3" stays accurate.
 */
const trimStoredWinners = (map: StoredWinnersMap, max: number): StoredWinnersMap => {
  const entries = Object.entries(map);
  if (entries.length <= max) return map;
  entries.sort((a, b) => a[1].awardedAt - b[1].awardedAt);
  const next: StoredWinnersMap = {};
  for (const [id, winner] of entries.slice(-max)) next[id] = winner;
  return next;
};

/**
 * Monsters whose award is still within the `WINNER_COOLDOWN_MS` window.
 * Returned as a Set for O(1) exclusion checks against roster ids. Past the
 * window a monster is eligible to backfill into a pool again (and to win
 * again) — `storedWinners` entries older than the cooldown stay around
 * purely for ribbon display on Gallery / Single Monster View.
 */
const recentlyCrownedIds = (storedWinners: StoredWinnersMap, now: number): Set<string> => {
  const cutoff = now - WINNER_COOLDOWN_MS;
  const ids = new Set<string>();
  for (const [id, w] of Object.entries(storedWinners)) {
    if (w.awardedAt > cutoff) ids.add(id);
  }
  return ids;
};

/**
 * Close out `previousCycle`: crown top-3 winners and fold them into the
 * storedWinners map (trimmed to STORED_WINNERS_MAX). No-op when voting is
 * off or no cycle was running.
 */
const closeCycle = (
  previousCycle: VoteCycle | null,
  weeklyVotingEnabled: boolean,
  monsters: MonsterRoster,
  storedWinners: StoredWinnersMap,
  now: number,
): { freshlyCrownedWinners: FreshlyCrownedWinner[]; storedWinners: StoredWinnersMap } => {
  if (!previousCycle || !weeklyVotingEnabled) {
    return { freshlyCrownedWinners: [], storedWinners };
  }

  // Build birthdates map so ties break by earliest.
  const birthdates = new Map<string, number>();
  for (const [id, entry] of Object.entries(monsters)) {
    if (entry?.birthdate) birthdates.set(id, entry.birthdate);
  }
  // Only EXCLUDE monsters still within the cooldown window from winning.
  // Monsters whose previous win is older than `WINNER_COOLDOWN_MS` have
  // re-entered the pool via backfill and are up for crowning again.
  const excluded = recentlyCrownedIds(storedWinners, now);
  const winners = computeWinners(previousCycle, birthdates, excluded);
  const freshlyCrownedWinners: FreshlyCrownedWinner[] = winners.map((w) => {
    const entry = monsters[w.monsterId];
    return {
      monsterId: w.monsterId,
      category: previousCycle.category,
      place: w.place as Place,
      awardedAt: now,
      contributorProfileIds: entry?.contributorProfileIds ?? [],
    };
  });

  const nextStored: StoredWinnersMap = { ...storedWinners };
  for (const w of freshlyCrownedWinners) {
    nextStored[w.monsterId] = { category: w.category, place: w.place, awardedAt: w.awardedAt };
  }
  return {
    freshlyCrownedWinners,
    storedWinners: trimStoredWinners(nextStored, STORED_WINNERS_MAX),
  };
};

/**
 * Build the next vote-cycle pool. Starts with `seedEligibleIds` (filtered
 * to complete, non-crowned monsters that still exist on the roster) and
 * backfills from older complete monsters sorted by (fewest `timesShown`,
 * newest `birthdate`) if short of MIN. Stops short if there aren't enough
 * candidates — caller decides whether that's enough to open a cycle.
 */
const buildPool = (
  seedEligibleIds: string[],
  monstersRoster: MonsterRoster,
  alreadyCrownedIds: Set<string>,
): string[] => {
  const pool: string[] = seedEligibleIds.filter((id) => {
    const entry = monstersRoster[id];
    return !!entry && entry.state === "complete" && !alreadyCrownedIds.has(id);
  });

  if (pool.length >= MIN_POOL_SIZE_FOR_VOTE) return pool;

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
  return pool;
};

/**
 * Open a vote cycle with the given pool when it hits MIN, advancing the
 * category pointer. Returns `cycle: null` when the pool is short OR when
 * `VOTING_CATEGORIES` is empty — in that case `nextCategoryIndex` is
 * returned unchanged.
 */
const openCycle = (params: {
  pool: string[];
  nextCategoryIndex: number;
  cycleId: string;
  startAt: number;
  endAt: number;
}): { cycle: VoteCycle | null; nextCategoryIndex: number } => {
  if (params.pool.length < MIN_POOL_SIZE_FOR_VOTE || VOTING_CATEGORIES.length === 0) {
    return { cycle: null, nextCategoryIndex: params.nextCategoryIndex };
  }
  const idx = params.nextCategoryIndex % VOTING_CATEGORIES.length;
  return {
    cycle: {
      cycleId: params.cycleId,
      category: VOTING_CATEGORIES[idx].id,
      startAt: params.startAt,
      endAt: params.endAt,
      poolMonsterIds: params.pool,
      tallies: {},
    },
    nextCategoryIndex: (idx + 1) % VOTING_CATEGORIES.length,
  };
};

// ─────────────────────────────────────────────────────────────────────
// Public entry points
// ─────────────────────────────────────────────────────────────────────

/**
 * Opportunistic weekly transition. Called from `handleGetMainApp` on every
 * open — if we've crossed into a new ET week since the last write, we:
 *
 *   1. Close the current submission window (freeze `eligibleMonsterIds`).
 *   2. Close the current vote cycle (if any) — compute top-3 winners,
 *      append to storedWinners, tell caller so the finalize side can
 *      grant badges + enqueue banners.
 *   3. Open the new submission window for the week we've just entered.
 *   4. Build the next cycle's pool from the previous window's fresh
 *      submissions, backfilled from older monsters if short of MIN.
 *      Open the cycle if we hit MIN, else skip.
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
        storedWinners: keyAssetDataObject.storedWinners ?? {},
        categoryNextIndex: keyAssetDataObject.categoryNextIndex ?? 0,
      },
      changed: false,
      freshlyCrownedWinners: [],
    };
  }

  const monstersRoster = keyAssetDataObject.monsters ?? {};
  const previousWindow = activeWindow;
  const prevEligible = previousWindow?.eligibleMonsterIds ?? [];

  // Step 1 + 2: close the previous week's cycle.
  const closed = closeCycle(
    keyAssetDataObject.currentVoteCycle ?? null,
    weeklyVotingEnabled,
    monstersRoster,
    keyAssetDataObject.storedWinners ?? {},
    now,
  );

  // Step 3: open a new submission window.
  const nextSubmissionWindow: SubmissionWindow = { ...nowWindow };

  // Step 4: build the pool from previous week's fresh submissions.
  // Only monsters still inside the cooldown window are blocked from
  // re-entering the pool. Older winners are free to backfill again.
  const alreadyCrownedIds = recentlyCrownedIds(closed.storedWinners, now);
  const pool = weeklyVotingEnabled ? buildPool(prevEligible, monstersRoster, alreadyCrownedIds) : [];
  const opened = openCycle({
    pool,
    nextCategoryIndex: keyAssetDataObject.categoryNextIndex ?? 0,
    cycleId: `${nowWindow.windowId}-vote`,
    startAt: nowWindow.startAt,
    endAt: nowWindow.endAt,
  });

  // Step 5: if no cycle opened, carry the previous window's fresh submissions
  // forward so they can try again next week instead of disappearing. The
  // backfilled OLD monsters stay on the roster and are reconsidered next
  // advance — no need to shove them into the submission window.
  if (!opened.cycle) {
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
      currentVoteCycle: opened.cycle,
      storedWinners: closed.storedWinners,
      categoryNextIndex: opened.nextCategoryIndex,
    },
    changed: true,
    freshlyCrownedWinners: closed.freshlyCrownedWinners,
  };
};

/**
 * Admin-triggered "start a new vote cycle NOW" transition. Reuses the same
 * close + pool-build + open logic as the weekly rollover, but WITHIN the
 * current submission window (doesn't roll to a new week):
 *
 *   - Closes the current cycle (if any), crowns winners, appends to
 *     `storedWinners`.
 *   - Keeps the current submission window intact: its `eligibleMonsterIds`
 *     seed the new pool.
 *   - Backfills + opens via the same helpers used by the Sunday rollover.
 *   - End date = current window's `endAt` (upcoming Sat 23:59 ET).
 *   - CycleId suffixed with the timestamp so it doesn't collide with the
 *     cycle we just closed — vote-count accounting on the client keys on
 *     cycleId, so a new id resets per-user counters cleanly.
 */
export const forceStartNewVoteCycle = (
  keyAssetDataObject: KeyAssetDataObject,
  now: number = Date.now(),
): WeeklyAdvanceResult => {
  const activeWindow = keyAssetDataObject.currentSubmissionWindow ?? currentSubmissionWindow(now);
  const weeklyVotingEnabled = keyAssetDataObject.weeklyVotingEnabled;
  const monstersRoster = keyAssetDataObject.monsters ?? {};

  const closed = closeCycle(
    keyAssetDataObject.currentVoteCycle ?? null,
    weeklyVotingEnabled,
    monstersRoster,
    keyAssetDataObject.storedWinners ?? {},
    now,
  );

  // See `recentlyCrownedIds` — only monsters still inside the cooldown
  // are blocked from the admin-forced new pool.
  const alreadyCrownedIds = recentlyCrownedIds(closed.storedWinners, now);
  const pool = weeklyVotingEnabled
    ? buildPool(activeWindow.eligibleMonsterIds ?? [], monstersRoster, alreadyCrownedIds)
    : [];
  const opened = openCycle({
    pool,
    nextCategoryIndex: keyAssetDataObject.categoryNextIndex ?? 0,
    cycleId: `${activeWindow.windowId}-vote-${now}`,
    startAt: now,
    endAt: activeWindow.endAt,
  });

  return {
    next: {
      currentSubmissionWindow: activeWindow,
      currentVoteCycle: opened.cycle,
      storedWinners: closed.storedWinners,
      categoryNextIndex: opened.nextCategoryIndex,
    },
    changed: true,
    freshlyCrownedWinners: closed.freshlyCrownedWinners,
  };
};
