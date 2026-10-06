import { MonsterMashVisitorData } from "@shared/types/index.js";
import { etDateKey } from "./computeWindows.js";

export interface CallerVoteCounts {
  votedToday: number;
  votedCycle: number;
}

/**
 * Compute the caller's `votedToday` + `votedCycle` counters from their
 * visitor dataObject. Centralized so handleGetVote and handleCastVote
 * can't drift.
 *
 * Reset rules (BOTH apply — whichever triggers first wins):
 *   - Daily counter resets at midnight ET (new `dateEt`).
 *   - BOTH counters reset when the cycleId changes — admin force-starting
 *     a new cycle (or the Sunday rollover) gives everyone a clean slate,
 *     even if they'd hit the daily cap earlier in the same ET day.
 *
 * An empty cycleId ("" — meaning no active vote) still forces a reset of
 * the cycle counter, same as before.
 */
export const computeCallerVoteCounts = (
  visitorData: MonsterMashVisitorData,
  cycleId: string,
  now: number = Date.now(),
): CallerVoteCounts => {
  const todayKey = etDateKey(now);
  const lastCycleId = visitorData.votesCastThisWeek?.windowId ?? "";
  const cycleChanged = lastCycleId !== cycleId;
  if (cycleChanged) return { votedToday: 0, votedCycle: 0 };
  const votedToday =
    visitorData.votesCastToday?.dateEt === todayKey ? (visitorData.votesCastToday?.count ?? 0) : 0;
  const votedCycle = visitorData.votesCastThisWeek?.count ?? 0;
  return { votedToday, votedCycle };
};
