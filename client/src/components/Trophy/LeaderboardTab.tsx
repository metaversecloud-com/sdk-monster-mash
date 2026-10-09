import { useContext, useState } from "react";
import { ConfirmationModal } from "@/components";
import { useBusy } from "@/context/BusyContext";
import { GlobalDispatchContext } from "@/context/GlobalContext";
import { ErrorType } from "@/context/types";
import { TrophyLeaderboardRow } from "@shared/types/index";
import { backendAPI, setErrorMessage } from "@/utils";

interface LeaderboardTabProps {
  rows: TrophyLeaderboardRow[];
  callerRow?: TrophyLeaderboardRow;
  isAdmin: boolean;
  onAfterReset: () => void;
}

export const LeaderboardTab = ({ rows, callerRow, isAdmin, onAfterReset }: LeaderboardTabProps) => {
  const dispatch = useContext(GlobalDispatchContext);
  const { isBusy, run } = useBusy();
  const [showReset, setShowReset] = useState(false);

  const handleReset = () =>
    run(async () => {
      try {
        await backendAPI.post("/leaderboard/reset");
        onAfterReset();
      } catch (error) {
        setErrorMessage(dispatch, error as ErrorType);
      }
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-sm uppercase tracking-wider mm-text-white font-semibold">Awards Won</p>
        </div>
        <div className="flex gap-6 text-xs mm-text-white uppercase tracking-wider">
          <span>awards</span>
          <span>built</span>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {rows.length === 0 && <p className="p2 mm-text-accent py-6 text-center">No award winners yet.</p>}
        {rows.map((row) => (
          <div
            key={row.profileId}
            className={`flex items-center gap-2 p-2 rounded mm-text-on-card mm-border-1  ${
              row.isCaller ? "mm-border-amber mm-bg-amber" : "mm-border-accent mm-bg-accent-lt"
            }`}
          >
            <span className="w-4 text-sm">{row.rank}</span>
            <span className="flex-1 font-semibold truncate">{row.displayName}</span>
            <span className="w-8 text-right font-semibold">{row.awardsWon}</span>
            <span className="w-8 text-right">{row.monstersContributedTo}</span>
          </div>
        ))}
        {callerRow && (
          <div className="flex items-center gap-2 p-2 rounded mm-border-1 mm-border-amber mm-bg-amber mt-2">
            <span className="mm-text-on-card-muted w-6 text-sm">{callerRow.rank}</span>
            <span className="flex-1 font-semibold truncate">{callerRow.displayName} (you)</span>
            <span className="w-8 text-right font-semibold">{callerRow.awardsWon}</span>
            <span className="w-8 text-right mm-text-on-card-muted">{callerRow.monstersContributedTo}</span>
          </div>
        )}
      </div>

      {isAdmin && (
        <button
          type="button"
          className="btn btn-danger-outline mt-4"
          onClick={() => setShowReset(true)}
          disabled={isBusy}
        >
          Reset Leaderboard
        </button>
      )}

      {showReset && (
        <ConfirmationModal
          title="Reset leaderboard?"
          message="All players' award counts and monsters-built totals start over from zero. Badges are not affected."
          confirmLabel="Reset Leaderboard"
          cancelLabel="Keep Leaderboard"
          handleOnConfirm={handleReset}
          handleToggleShowConfirmationModal={() => setShowReset(false)}
        />
      )}
    </div>
  );
};

export default LeaderboardTab;
