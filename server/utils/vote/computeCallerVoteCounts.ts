import { MonsterMashVisitorData } from "@shared/types/index.js";
import { etDateKey } from "./computeWindows.js";

/**
 * Compute the caller's `votedToday` counter from their visitor dataObject.
 * Centralized so handleGetVote and handleCastVote can't drift.
 *
 * Reset rules (whichever triggers first wins):
 *   - Resets at midnight ET (new `dateEt`).
 *   - Resets when the cycleId changes — admin force-starting a new cycle
 *     (or the Sunday rollover) gives everyone a clean slate, even if they'd
 *     hit the daily cap earlier in the same ET day.
 *
 * An empty cycleId ("" — meaning no active vote) still forces a reset.
 */
export const computeVotedToday = (
  visitorData: MonsterMashVisitorData,
  cycleId: string,
  now: number = Date.now(),
): number => {
  const lastCycleId = visitorData.votesCastThisWeek?.windowId ?? "";
  if (lastCycleId !== cycleId) return 0;
  const todayKey = etDateKey(now);
  if (visitorData.votesCastToday?.dateEt !== todayKey) return 0;
  return visitorData.votesCastToday?.count ?? 0;
};
