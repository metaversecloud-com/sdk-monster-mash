import { useContext, useEffect, useState } from "react";

// components
import { Countdown } from "./Countdown.js";
import { LastWeeksWinners } from "./LastWeeksWinners.js";
import { MatchupCard } from "./MatchupCard.js";

// context
import { useBusy } from "@/context/BusyContext";
import { GlobalDispatchContext, GlobalStateContext } from "@/context/GlobalContext";
import { ErrorType } from "@/context/types";

// shared
import { VoteResponseData } from "@shared/types/index";

// utils
import { backendAPI, setErrorMessage } from "@/utils";

/**
 * Epic 6 Vote tab — three states (mockups image28 / image22 / image31):
 *   - running: countdown + winners row + question + VS matchup + fine print
 *   - scheduled: "No vote is running right now" + next-Sunday date
 *   - not-enough-monsters: pool-progress explainer
 *   - voting-off (admin): "Check in with your teacher about the next vote!"
 */
export const VoteTab = () => {
  const dispatch = useContext(GlobalDispatchContext);
  const { hasInteractiveParams } = useContext(GlobalStateContext);

  const { isBusy, run } = useBusy();
  const [vote, setVote] = useState<VoteResponseData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!hasInteractiveParams) return;
    fetchVote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasInteractiveParams]);

  const fetchVote = () => {
    setIsLoading(true);
    backendAPI
      .get("/vote")
      .then((response) => {
        if (response?.data?.success) setVote(response.data.data);
      })
      .catch((error) => setErrorMessage(dispatch, error as ErrorType))
      .finally(() => setIsLoading(false));
  };

  const castVote = (winnerId: string, loserId: string) => {
    if (isBusy) return;
    return run(async () => {
      try {
        const response = await backendAPI.post("/vote/cast", {
          winnerMonsterId: winnerId,
          loserMonsterId: loserId,
        });
        if (response?.data?.success) {
          const { next, callerVoteState } = response.data.data;
          setVote((prev) =>
            prev
              ? {
                  ...prev,
                  matchup: next ?? null,
                  callerVoteState,
                }
              : prev,
          );
        }
      } catch (error) {
        setErrorMessage(dispatch, error as ErrorType);
      }
    });
  };

  return (
    <div
      role="tabpanel"
      id="monster-mash-tab-vote"
      aria-labelledby="monster-mash-tab-btn-vote"
      className="flex flex-col gap-4 py-6 px-2"
    >
      {isLoading ? (
        <p className="p2 text-center mm-text-muted py-10">Loading vote…</p>
      ) : !vote ? (
        <p className="p2 text-center mm-text-muted py-10">Vote unavailable right now.</p>
      ) : (
        <>
          <div className="flex justify-between items-start gap-4 flex-wrap">
            {vote.state === "running" && vote.cycleEndsAt ? (
              <div className="p-4 rounded-2xl border-2 mm-border-amber bg-amber-50 flex-1 min-w-[280px]">
                <Countdown targetMs={vote.cycleEndsAt} />
                <p className="p2 mt-1">left to vote on last week's monsters!</p>
                <p className="text-xs text-gray-500 mt-1">
                  Times are a guide — the window opens and closes the next time someone opens the app.
                </p>
              </div>
            ) : (
              <div />
            )}
            <LastWeeksWinners winners={vote.lastWinners} />
          </div>

          {vote.state === "running" && vote.matchup && vote.categoryQuestion && (
            <>
              <h2 className="h2 text-center mt-4">Which one is the {vote.categoryQuestion}?</h2>
              <div className="flex items-center justify-center gap-4 flex-wrap">
                <MatchupCard
                  monster={vote.matchup.pair[0]}
                  onVote={() => castVote(vote.matchup!.pair[0].monsterId, vote.matchup!.pair[1].monsterId)}
                  isVoting={isBusy}
                  disabled={vote.callerVoteState.hitCap}
                />
                <span className="rounded-full bg-gray-900 text-white text-lg font-bold px-4 py-2">VS</span>
                <MatchupCard
                  monster={vote.matchup.pair[1]}
                  onVote={() => castVote(vote.matchup!.pair[1].monsterId, vote.matchup!.pair[0].monsterId)}
                  isVoting={isBusy}
                  disabled={vote.callerVoteState.hitCap}
                />
              </div>
              <p className="p2 text-center mm-text-muted">
                {vote.callerVoteState.hitCap
                  ? `You've hit your vote cap for this cycle (${vote.callerVoteState.cap}). Come back next week!`
                  : `You've voted ${vote.callerVoteState.voted} of ${vote.callerVoteState.cap} times this cycle. Winners appear the next time you open the app after voting closes.`}
              </p>
            </>
          )}

          {vote.state === "not-enough-monsters" && (
            <div className="text-center py-12">
              <h3 className="h3">Not enough monsters for a vote yet</h3>
              <p className="p2 mt-2 mm-text-muted">
                {vote.poolSize ?? 0} of the {vote.minPoolSize} monsters needed are in the pool.
              </p>
            </div>
          )}

          {vote.state === "scheduled" && (
            <div className="text-center py-12">
              <h3 className="h3">No vote is running right now</h3>
              <p className="p2 mt-2 mm-text-muted">
                {vote.nextScheduledStartAt
                  ? `The next vote goes live on ${new Date(vote.nextScheduledStartAt).toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}!`
                  : "The next vote will open when this week's submission window closes."}
              </p>
              <p className="text-xs text-gray-500 mt-1">(it opens the first time someone opens the app that day)</p>
            </div>
          )}

          {vote.state === "voting-off" && (
            <div className="text-center py-12">
              <h3 className="h3">No vote is running right now</h3>
              <p className="p2 mt-2 mm-text-muted italic">Check in with your teacher about the next vote!</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default VoteTab;
