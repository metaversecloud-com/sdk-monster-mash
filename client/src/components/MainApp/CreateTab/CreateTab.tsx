import { useContext, useMemo, useState } from "react";

// components
import { ConfirmationModal } from "@/components";
import { MonsterCard } from "./MonsterCard.js";

// context
import { useBusy } from "@/context/BusyContext";
import { GlobalDispatchContext, GlobalStateContext } from "@/context/GlobalContext";
import { ErrorType } from "@/context/types";

// shared
import { MonsterIndexEntry, Section } from "@shared/types/index";

// utils
import { backendAPI, setErrorMessage, setMainAppState } from "@/utils";

/**
 * Epic 4 Create tab: full card grid (mockup image11).
 *
 * Card ordering — first to last:
 *   1. Create-New tile (always).
 *   2. Cards where the caller has an active draft (Resume prompt on top).
 *   3. Cards where the caller has contributed a section (Done state, art
 *      visible per §Reveal rule).
 *   4. Cards with at least one AVAILABLE section (Join-target).
 *   5. Remaining in-progress cards (all locked/done, no caller stake).
 *
 * Admin trash → in-progress delete confirm (spec §Admin, mockup image13).
 * Race on Join → toast + refetch (mockup image12 is Builder-side).
 */
export const CreateTab = () => {
  const dispatch = useContext(GlobalDispatchContext);
  const { mainApp, visitor, isAdmin } = useContext(GlobalStateContext);
  const activeDraft = mainApp?.activeDraft;

  const { isBusy, run } = useBusy();
  const [deleteTarget, setDeleteTarget] = useState<MonsterIndexEntry | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  const roster = mainApp?.monsters ?? [];
  const callerProfileId = visitor?.profileId ?? "";

  const sortedRoster = useMemo(() => {
    const draftId = activeDraft?.monsterId;
    const withScore = roster
      .filter((m) => m.state === "in-progress")
      // Hide monsters with zero completed sections. There's no collaborative
      // signal yet (nothing to reveal, no peer contributor names), and for
      // the caller's own draft the Resume tile above already covers it.
      .filter((m) => Object.values(m.sections ?? {}).some((s) => s?.status === "done"))
      .map((m) => {
        const isDraft = m.monsterId === draftId;
        const contributed = (m.contributorProfileIds ?? []).includes(callerProfileId);
        const hasAvailable = Object.values(m.sections ?? {}).some((s) => s?.status === "available");
        // Lower `bucket` sorts first.
        const bucket = isDraft ? 0 : contributed ? 1 : hasAvailable ? 2 : 3;
        return { m, bucket };
      });
    withScore.sort((a, b) => a.bucket - b.bucket || (b.m.lastEditedAt ?? 0) - (a.m.lastEditedAt ?? 0));
    return withScore.map((x) => x.m);
  }, [roster, activeDraft, callerProfileId]);

  const refreshMainApp = () =>
    backendAPI
      .get("/main-app")
      .then((response) => {
        if (response?.data?.success && response.data.data) setMainAppState(dispatch, response.data.data);
      })
      .catch(() => {});

  // Every builder transition (Create / Join / Resume) is initiated by a
  // POST that closes THIS iframe (main-app modal) and opens a fresh
  // Builder iframe as a drawer with all credentials preserved. Client
  // doesn't need to `navigate()` — Topia's iframe swap replaces the DOM.
  const startNew = () => {
    if (isBusy || activeDraft) return;
    return run(async () => {
      try {
        await backendAPI.post(`/monsters/start`);
      } catch (error) {
        setErrorMessage(dispatch, error as ErrorType);
      }
    });
  };

  const resumeDraft = () => {
    if (!activeDraft || isBusy) return;
    return run(async () => {
      try {
        await backendAPI.post(`/monsters/${activeDraft.monsterId}/resume`, {
          section: activeDraft.section,
        });
      } catch (error) {
        const httpStatus = (error as { response?: { status?: number } })?.response?.status;
        if (httpStatus === 409) {
          setClaimError("Your draft is out of date — reloading Monster Mash.");
          refreshMainApp();
        } else {
          setErrorMessage(dispatch, error as ErrorType);
        }
      }
    });
  };

  const joinSection = (entry: MonsterIndexEntry, section: Section) => {
    if (isBusy) return;
    if (activeDraft) {
      setClaimError("You already have a section in progress. Finish or abandon it first.");
      return;
    }
    setClaimError(null);
    return run(async () => {
      try {
        await backendAPI.post(`/monsters/${entry.monsterId}/claim`, { section });
      } catch (error) {
        const httpStatus = (error as { response?: { status?: number } })?.response?.status;
        if (httpStatus === 409) {
          setClaimError("Oops, that one was just claimed! Try another.");
          refreshMainApp();
        } else {
          setErrorMessage(dispatch, error as ErrorType);
        }
      }
    });
  };

  const resumeSection = (entry: MonsterIndexEntry, section: Section) => {
    // Sanity: only route Resume when the slot is truly the caller's active draft.
    if (activeDraft?.monsterId === entry.monsterId && activeDraft.section === section) {
      resumeDraft();
    }
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    return run(async () => {
      try {
        await backendAPI.delete(`/monsters/${deleteTarget.monsterId}`);
        setDeleteTarget(null);
        await refreshMainApp();
      } catch (error) {
        setErrorMessage(dispatch, error as ErrorType);
      }
    });
  };

  return (
    <div
      role="tabpanel"
      id="monster-mash-tab-create"
      aria-labelledby="monster-mash-tab-btn-create"
      className="flex flex-col gap-6 py-6"
    >
      {claimError && (
        <div role="alert" className="card p-3 border-l-4 border-red-500 bg-red-50 text-red-700">
          {claimError}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {/* Create-New tile — always first. */}
        <button
          type="button"
          className="card p-6 flex flex-col items-center justify-center gap-2 min-h-[220px] border-dashed border-2 border-blue-300 hover:border-blue-500"
          onClick={startNew}
          disabled={isBusy}
        >
          <span aria-hidden="true" className="text-5xl">
            ➕
          </span>
          <span className="h4">Create New Monster</span>
          <span className="p2 text-gray-600 text-center">
            Server picks your section at random — head, torso, or legs.
          </span>
        </button>

        {/* Resume tile — only when the caller's draft monster is NOT already
            visible as a MonsterCard on the grid (i.e., it's their first
            section on that monster and the roster filter hides it). Once
            another section is done the MonsterCard renders and its own
            "Resume" slot covers this affordance. */}
        {activeDraft && !sortedRoster.some((m) => m.monsterId === activeDraft.monsterId) && (
          <button
            type="button"
            className="card p-6 flex flex-col items-center justify-center gap-2 min-h-[220px] border-2 border-amber-400"
            onClick={resumeDraft}
            disabled={isBusy}
          >
            <span aria-hidden="true" className="text-5xl">
              🎨
            </span>
            <span className="h4">Resume {activeDraft.section}</span>
            <span className="p2 text-gray-600 text-center">
              Locked at {new Date(activeDraft.lockedAt).toLocaleString()}. Auto-releases after 30 min of idle.
            </span>
          </button>
        )}

        {sortedRoster.map((entry) => (
          <MonsterCard
            key={entry.monsterId}
            entry={entry}
            callerProfileId={callerProfileId}
            callerIsAdmin={!!isAdmin}
            callerHasActiveDraft={!!activeDraft}
            callerDrafts={mainApp?.contributedDrafts?.[entry.monsterId]}
            onJoin={(section) => joinSection(entry, section)}
            onResume={(section) => resumeSection(entry, section)}
            onAdminDelete={() => setDeleteTarget(entry)}
          />
        ))}
      </div>

      {sortedRoster.length === 0 && !activeDraft && (
        <p className="p2 text-center text-gray-600">
          No monsters in progress yet — click "Create New Monster" to start one.
        </p>
      )}

      {deleteTarget && (
        <ConfirmationModal
          title={`Delete this monster in progress?`}
          message={buildDeleteMessage(deleteTarget)}
          handleOnConfirm={confirmDelete}
          handleToggleShowConfirmationModal={() => setDeleteTarget(null)}
          confirmLabel="Delete monster"
          cancelLabel="Keep monster"
        />
      )}
    </div>
  );
};

const buildDeleteMessage = (entry: MonsterIndexEntry): string => {
  const contribCount = (entry.contributorProfileIds ?? []).length;
  const names = new Set<string>();
  for (const s of ["head", "torso", "legs"] as const) {
    const n = entry.sections?.[s]?.contributorDisplayName;
    if (n) names.add(n);
  }
  const nameList = Array.from(names).join(", ");
  if (contribCount === 0) return "This monster has no submitted sections yet. Deletion is permanent.";
  return `${contribCount} section(s) have been submitted${nameList ? ` by ${nameList}` : ""}. This cannot be undone.`;
};

export default CreateTab;
