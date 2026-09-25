import { useContext, useState } from "react";

// components
import { ConfirmationModal } from "./ConfirmationModal.js";
import { Logo } from "./Logo.js";

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
    <div className="flex flex-col items-center gap-2 text-center">
      <Logo className="h-8 w-auto mx-auto" />
      <h3 className="h3">Admin Settings</h3>

      {/* Weekly voting toggle row */}
      <div className="card p-3 flex flex-col gap-3 text-left mt-2">
        <div className="flex gap-1">
          <p className="font-semibold flex-grow">Weekly voting</p>
          <button
            type="button"
            role="switch"
            aria-checked={currentEnabled}
            aria-label={`Weekly voting is ${currentEnabled ? "on" : "off"}`}
            disabled={isBusy}
            onClick={handleToggleClick}
            className={`relative flex-shrink-0 w-10 h-6 rounded-full transition ${
              currentEnabled ? "bg-green-500" : "bg-gray-300"
            } ${isBusy ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          >
            <span
              aria-hidden="true"
              className={`absolute top-0.5 w-6 h-4 rounded-full bg-white shadow transition-all ${
                currentEnabled ? "left-[calc(100%-1.625rem)]" : "left-0.5"
              }`}
            />
          </button>
        </div>
        <p className="p2 text-gray-600">
          Runs the automatic weekly submission and voting windows (Sunday to Saturday, ET). When OFF: no new votes
          start, no awards are given, and the Vote tab shows the "no active vote" state ("Check in with your teacher
          about the next vote!").
        </p>
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
