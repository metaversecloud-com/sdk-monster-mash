import { useContext, useEffect, useState } from "react";

// components
import { Countdown } from "./Countdown.js";
import { LastWeeksWinners } from "./LastWeeksWinners.js";
import { MatchupCard } from "./MatchupCard.js";
import NotificationBox from "@/components/shared/NotificationBox.js";

// context
import { useBusy } from "@/context/BusyContext";
import { GlobalDispatchContext, GlobalStateContext } from "@/context/GlobalContext";
import { ErrorType } from "@/context/types";

// shared
import { VoteResponseData } from "@shared/types/index";

// utils
import { backendAPI, setErrorMessage } from "@/utils";

/**
 * Vote tab - three states:
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

  const startNew = () => {
    if (isBusy) return;
    return run(async () => {
      try {
        await backendAPI.post(`/monsters/start`);
      } catch (error) {
        setErrorMessage(dispatch, error as ErrorType);
      }
    });
  };

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
          setErrorMessage(dispatch, "");
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
      className="flex flex-col gap-4 py-2"
    >
      {isLoading ? (
        <p className="p2 text-center mm-text-muted py-10">Loading vote…</p>
      ) : !vote ? (
        <p className="p2 text-center mm-text-muted py-10">Vote unavailable right now.</p>
      ) : (
        <>
          <div className="flex justify-between items-start gap-4 flex-wrap">
            {vote.state === "running" && vote.cycleEndsAt && (
              <div className="p-2 rounded-2xl mm-border-2 mm-border-amber mm-bg-amber flex-1 min-w-[280px]">
                <Countdown targetMs={vote.cycleEndsAt} />
                <p className="p2 mt-1">left to vote on last week's monsters!</p>
              </div>
            )}
            <LastWeeksWinners winners={vote.lastWinners} />
          </div>

          {vote.state === "running" && (
            <>
              {vote.matchup && vote.categoryQuestion && (
                <>
                  <h2 className="mm-text-white text-center mt-4">Which one is the {vote.categoryQuestion}?</h2>
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
                </>
              )}

              {vote.callerVoteState.hitDailyCap ? (
                <NotificationBox
                  header="Maximum votes reached!"
                  text="You've reached your maximum votes for today! Come back tomorrow to vote again."
                />
              ) : (
                <p className="p2 text-center mm-text-muted">
                  You've voted {vote.callerVoteState.votedToday} of {vote.callerVoteState.dailyCap} times today. Winners
                  appear the next time you open the app after voting closes.
                </p>
              )}
            </>
          )}

          {vote.state === "not-enough-monsters" && (
            <NotificationBox
              header="Not enough monsters for a vote yet"
              text={
                <>
                  {vote.poolSize ?? 0} of the {vote.minPoolSize} monsters needed are in the pool.
                  <br />
                  Finish {vote.minPoolSize - (vote.poolSize || 0)} more and the next vote can start!
                </>
              }
            >
              <button type="button" className="btn mm-btn-sm w-fit mx-auto" onClick={startNew} disabled={isBusy}>
                Go build a monster →
              </button>
            </NotificationBox>
          )}

          {vote.state === "scheduled" && (
            <NotificationBox
              header="No vote is running right now"
              text={
                vote.nextScheduledStartAt
                  ? `The next vote goes live on ${new Date(vote.nextScheduledStartAt).toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}!`
                  : "The next vote will open when this week's submission window closes."
              }
            />
          )}

          {vote.state === "voting-off" && (
            <NotificationBox
              header="No vote is running right now"
              text="Check in with your teacher about the next vote!"
            />
          )}
        </>
      )}
    </div>
  );
};

export default VoteTab;
