import { useContext, useState } from "react";

// components
import { ConfirmationModal } from "./ConfirmationModal.js";

// context
import { useBusy } from "@/context/BusyContext";
import { GlobalDispatchContext, GlobalStateContext } from "@/context/GlobalContext";
import { ErrorType } from "@/context/types";

// utils
import { backendAPI, setErrorMessage, setMainAppState } from "@/utils";

/**
 * Monster Mash Admin Settings surface (plan §10.13). Renders inside
 * PageContainer when the caller taps the gear icon.
 *
 * Weekly voting toggle:
 *   - ON  → automatic Sunday→Saturday windows + Sunday vote rollovers.
 *   - OFF → freeze the machinery; the current vote cycle is nulled on the
 *           same server write ("The current vote will end right away and
 *           no awards will be given for it"). Turning back ON does not
 *           immediately open a vote — the next Sunday rollover does.
 */
export const AdminView = () => {
  const dispatch = useContext(GlobalDispatchContext);
  const { mainApp } = useContext(GlobalStateContext);
  const { isBusy, run } = useBusy();

  const currentEnabled = mainApp?.weeklyVotingEnabled ?? true;
  const hasActiveCycle = !!mainApp?.currentVoteCycle;

  const [pendingOff, setPendingOff] = useState(false);

  const refreshMainApp = () =>
    backendAPI
      .get("/main-app")
      .then((response) => {
        if (response?.data?.success && response.data.data) setMainAppState(dispatch, response.data.data);
      })
      .catch(() => {});

  const applyToggle = (nextEnabled: boolean) =>
    run(async () => {
      try {
        await backendAPI.put("/admin/settings", { weeklyVotingEnabled: nextEnabled });
        await refreshMainApp();
      } catch (error) {
        setErrorMessage(dispatch, error as ErrorType);
      }
    });

  const handleToggleClick = () => {
    if (isBusy) return;
    // Turning OFF while a cycle is running → confirm (plan §10.13 modal).
    if (currentEnabled && hasActiveCycle) {
      setPendingOff(true);
      return;
    }
    applyToggle(!currentEnabled);
  };

  const confirmEndVoteAndTurnOff = async () => {
    setPendingOff(false);
    await applyToggle(false);
  };

  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="flex items-center gap-2">
        <h3 className="h3">Admin Settings</h3>
        <span className="text-[10px] uppercase tracking-wider rounded-full bg-red-100 text-red-700 px-2 py-0.5 font-semibold">
          admins only
        </span>
      </div>

      {/* Weekly voting toggle row */}
      <div className="card p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <p className="font-semibold">Weekly voting</p>
            <p className="p2 text-gray-600">
              Runs the automatic weekly submission and voting windows (Sunday to Saturday, ET). When OFF: no new votes
              start, no awards are given, and the Vote tab shows the "no active vote" state ("Check in with your teacher
              about the next vote!").
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={currentEnabled}
            aria-label={`Weekly voting is ${currentEnabled ? "on" : "off"}`}
            disabled={isBusy}
            onClick={handleToggleClick}
            className={`relative flex-shrink-0 w-14 h-7 rounded-full transition ${
              currentEnabled ? "bg-green-500" : "bg-gray-300"
            } ${isBusy ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          >
            <span
              aria-hidden="true"
              className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${
                currentEnabled ? "left-[calc(100%-1.625rem)]" : "left-0.5"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Reserved space for future admin settings — placeholder per plan §10.13. */}
      <div className="card p-4 border-dashed border-2 border-gray-300 text-center text-xs text-gray-500">
        ( future admin settings )
      </div>

      {pendingOff && (
        <ConfirmationModal
          title="Turn off weekly voting?"
          message="The current vote will end right away and no awards will be given for it. Players can still build monsters."
          confirmLabel="End Vote & Turn Off"
          cancelLabel="Keep Voting On"
          handleOnConfirm={confirmEndVoteAndTurnOff}
          handleToggleShowConfirmationModal={() => setPendingOff(false)}
        />
      )}
    </div>
  );
};

export default AdminView;
