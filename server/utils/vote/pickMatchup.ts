import { VoteCycle } from "@shared/types/index.js";

export interface Matchup {
  matchupId: string;
  pair: [string, string];
}

/**
 * Pick two monsters for a matchup.
 *
 * Strategy: sort by Laplace-smoothed win rate ascending, take the two least-
 * shown monsters near the front of the queue so every monster gets seen. To
 * add variance we randomly perturb the pick within a top-half window.
 *
 * Excludes `alreadyShownTo` (monsters this caller has already been offered
 * enough times this cycle) — the client passes those in from its vote-cap
 * bookkeeping.
 */
export const pickMatchup = (
  cycle: VoteCycle,
  alreadyShownTo: Set<string> = new Set(),
  random: () => number = Math.random,
): Matchup | null => {
  const pool = (cycle.poolMonsterIds ?? []).filter((id) => !alreadyShownTo.has(id));
  if (pool.length < 2) return null;

  const scored = pool.map((id) => {
    const t = cycle.tallies?.[id] ?? { shown: 0, wins: 0 };
    return { id, shown: t.shown };
  });
  // Under-shown first, then random tiebreak.
  scored.sort((a, b) => a.shown - b.shown || (random() - 0.5));

  const halfWindow = Math.max(2, Math.min(scored.length, Math.floor(scored.length / 2)));
  const bucket = scored.slice(0, halfWindow);
  const idxA = Math.floor(random() * bucket.length);
  let idxB = Math.floor(random() * bucket.length);
  if (idxB === idxA) idxB = (idxB + 1) % bucket.length;

  const [a, b] = [bucket[idxA].id, bucket[idxB].id];
  const matchupId = `${cycle.cycleId}:${a}:${b}:${Math.floor(random() * 1e9).toString(36)}`;
  return { matchupId, pair: [a, b] };
};
