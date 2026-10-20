import { FINISHED_CAP, MIN_POOL_SIZE_FOR_VOTE, WINNER_COOLDOWN_MS } from "@shared/content/monsterMash.js";
import { KeyAssetDataObject, MonsterIndexEntry, VoteCycle } from "@shared/types/index.js";

/**
 * Hard cap on how many live roster monsters we'll backfill into the pool
 * in a single rescue pass. Matches `FINISHED_CAP` so a rescued pool can
 * grow back to the roster's full capacity — the daily vote cap is
 * `poolSize × 1`, so capping backfill lower was silently throttling how
 * many votes a kid could cast per day after an eviction cascade.
 */
const RESCUE_BACKFILL_CAP = FINISHED_CAP;

export interface RescueResult {
  changed: boolean;
  nextCycle: VoteCycle | null;
}

/**
 * When `evictFinishedIfCapped` prunes roster entries but the pool still
 * references their ids, `pickMatchup`'s live-filter can collapse the
 * usable pool to < `MIN_POOL_SIZE_FOR_VOTE` and the Vote tab goes empty.
 * This helper rebuilds the pool by:
 *
 *   1. Keeping only pool ids that are still on the roster.
 *   2. If that live-filtered pool is below MIN, backfilling with the
 *      newest complete monsters NOT already in the pool and NOT in the
 *      winner cooldown window.
 *   3. Pruning the `tallies` map to drop entries for monsters no longer
 *      in the pool.
 *
 * Pure — the caller merges `nextCycle` into their keyAsset write.
 */
export const rescueVotePool = (dataObject: KeyAssetDataObject, now: number): RescueResult => {
  const cycle = dataObject.currentVoteCycle;
  if (!cycle) return { changed: false, nextCycle: null };

  const roster = dataObject.monsters ?? {};
  const livePool = (cycle.poolMonsterIds ?? []).filter((id) => !!roster[id]);
  const stored = dataObject.storedWinners ?? {};

  // Short-circuit: if the pool is already fine AND nothing stale is in it,
  // no write needed.
  if (livePool.length >= MIN_POOL_SIZE_FOR_VOTE && livePool.length === cycle.poolMonsterIds.length) {
    return { changed: false, nextCycle: cycle };
  }

  let nextPool = livePool;

  if (nextPool.length < MIN_POOL_SIZE_FOR_VOTE) {
    const livePoolSet = new Set(livePool);
    const recentlyCrowned = new Set<string>();
    for (const [id, w] of Object.entries(stored)) {
      if (now - w.awardedAt < WINNER_COOLDOWN_MS) recentlyCrowned.add(id);
    }

    const backfill = (Object.entries(roster) as Array<[string, MonsterIndexEntry | undefined]>)
      .filter(([id, m]) => !!m && m.state === "complete" && !livePoolSet.has(id) && !recentlyCrowned.has(id))
      .sort(([, a], [, b]) => (b?.birthdate ?? 0) - (a?.birthdate ?? 0))
      .slice(0, RESCUE_BACKFILL_CAP)
      .map(([id]) => id);

    nextPool = [...livePool, ...backfill];
  }

  const nextPoolSet = new Set(nextPool);
  const nextTallies: VoteCycle["tallies"] = {};
  for (const [id, t] of Object.entries(cycle.tallies ?? {})) {
    if (nextPoolSet.has(id)) nextTallies[id] = t;
  }

  return {
    changed: true,
    nextCycle: { ...cycle, poolMonsterIds: nextPool, tallies: nextTallies },
  };
};
