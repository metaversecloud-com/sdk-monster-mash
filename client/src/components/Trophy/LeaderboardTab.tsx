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
  cap: number;
  isAdmin: boolean;
  onAfterReset: () => void;
}

/**
 * Trophy Leaderboard tab (mockup image21 / image30). Single sorted list —
 * AWARDS WON, tiebreak MONSTERS BUILT. Yellow highlight on caller row.
 * Admin footer: Reset Leaderboard button + confirm.
 */
export const LeaderboardTab = ({ rows, callerRow, cap, isAdmin, onAfterReset }: LeaderboardTabProps) => {
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
          <p className="text-sm uppercase tracking-wider text-gray-600 font-semibold">Awards Won</p>
          <p className="text-xs text-gray-500">one list — ties break on monsters worked on</p>
        </div>
        <div className="flex gap-6 text-xs text-gray-500 uppercase tracking-wider">
          <span>awards</span>
          <span>built</span>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {rows.length === 0 && (
          <p className="p2 text-gray-600 py-6 text-center">No award winners yet.</p>
        )}
        {rows.map((row) => (
          <div
            key={row.profileId}
            className={`flex items-center gap-2 p-2 rounded border ${
              row.isCaller ? "bg-yellow-50 border-yellow-400" : "border-gray-200"
            }`}
          >
            <span className="text-gray-500 w-6 text-sm">{row.rank}</span>
            <span className="flex-1 font-semibold truncate">{row.displayName}</span>
            <span className="w-8 text-right font-semibold">{row.awardsWon}</span>
            <span className="w-8 text-right text-gray-500">{row.monstersContributedTo}</span>
          </div>
        ))}
        {callerRow && (
          <div className="flex items-center gap-2 p-2 rounded border bg-yellow-50 border-yellow-400 mt-2">
            <span className="text-gray-500 w-6 text-sm">{callerRow.rank}</span>
            <span className="flex-1 font-semibold truncate">{callerRow.displayName} (you)</span>
            <span className="w-8 text-right font-semibold">{callerRow.awardsWon}</span>
            <span className="w-8 text-right text-gray-500">{callerRow.monstersContributedTo}</span>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-500 text-center pt-2">( scrolls — top {cap} only, this instance )</p>

      {isAdmin && (
        <button
          type="button"
          className="btn btn-danger-outline mt-4"
          onClick={() => setShowReset(true)}
          disabled={isBusy}
        >
          Reset Leaderboard (admin only)
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
