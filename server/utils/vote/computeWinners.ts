import { Place, VoteCycle } from "@shared/types/index.js";

export interface ComputedWinner {
  monsterId: string;
  place: Place;
  winRate: number;
  shown: number;
  wins: number;
}

/**
 * Compute the top-3 winners from a vote cycle's tallies.
 *
 * Ranking:
 *   1. Laplace-smoothed win rate: (wins + 1) / (shown + 2). Smoothing prevents
 *      a 1-for-1 monster from beating a 20-for-22 monster.
 *   2. Tiebreak by absolute vote count (`shown`) — surface-area matters.
 *   3. Final tiebreak by earliest birthdate (`birthdates` param, monsterId → epoch).
 *   4. If still tied, sort by monsterId to keep the result deterministic.
 *
 * Callers pass the pool + optional exclusion set (past stored winners) so a
 * monster that already won can't win again.
 */
export const computeWinners = (
  cycle: VoteCycle,
  birthdates: Map<string, number>,
  excludedMonsterIds: Set<string> = new Set(),
): ComputedWinner[] => {
  const rows: ComputedWinner[] = [];
  for (const monsterId of cycle.poolMonsterIds ?? []) {
    if (excludedMonsterIds.has(monsterId)) continue;
    const t = cycle.tallies?.[monsterId] ?? { shown: 0, wins: 0 };
    const winRate = (t.wins + 1) / (t.shown + 2);
    rows.push({ monsterId, place: 1, winRate, shown: t.shown, wins: t.wins });
  }
  rows.sort((a, b) => {
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    if (b.shown !== a.shown) return b.shown - a.shown;
    const ba = birthdates.get(a.monsterId) ?? Number.POSITIVE_INFINITY;
    const bb = birthdates.get(b.monsterId) ?? Number.POSITIVE_INFINITY;
    if (ba !== bb) return ba - bb;
    return a.monsterId.localeCompare(b.monsterId);
  });
  return rows.slice(0, 3).map((row, idx) => ({ ...row, place: (idx + 1) as Place }));
};
