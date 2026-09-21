import { useContext, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

// components
import { ConfirmationModal } from "@/components";
import { MonsterCard } from "./MonsterCard.js";

// context
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
  const navigate = useNavigate();
  const { mainApp, visitor, isAdmin } = useContext(GlobalStateContext);
  const activeDraft = mainApp?.activeDraft;

  const [isBusy, setIsBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MonsterIndexEntry | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  const roster = mainApp?.monsters ?? [];
  const callerProfileId = visitor?.profileId ?? "";

  const sortedRoster = useMemo(() => {
    const draftId = activeDraft?.monsterId;
    const withScore = roster
      .filter((m) => m.state === "in-progress")
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

  const startNew = async () => {
    if (isBusy || activeDraft) return;
    setIsBusy(true);
    try {
      const response = await backendAPI.post(`/monsters/start`);
      if (response?.data?.success) {
        const { monsterId, section } = response.data.data;
        navigate(`/?screen=builder&monsterId=${monsterId}&section=${section}`, { replace: true });
      }
    } catch (error) {
      setErrorMessage(dispatch, error as ErrorType);
    } finally {
      setIsBusy(false);
    }
  };

  const resumeDraft = () => {
    if (!activeDraft) return;
    navigate(`/?screen=builder&monsterId=${activeDraft.monsterId}&section=${activeDraft.section}`, {
      replace: true,
    });
  };

  const joinSection = async (entry: MonsterIndexEntry, section: Section) => {
    if (isBusy) return;
    if (activeDraft) {
      setClaimError("You already have a section in progress. Finish or abandon it first.");
      return;
    }
    setIsBusy(true);
    setClaimError(null);
    try {
      await backendAPI.post(`/monsters/${entry.monsterId}/claim`, { section });
      navigate(`/?screen=builder&monsterId=${entry.monsterId}&section=${section}`, { replace: true });
    } catch (error) {
      const httpStatus = (error as { response?: { status?: number } })?.response?.status;
      if (httpStatus === 409) {
        setClaimError("Oops, that one was just claimed! Try another.");
        refreshMainApp();
      } else {
        setErrorMessage(dispatch, error as ErrorType);
      }
    } finally {
      setIsBusy(false);
    }
  };

  const resumeSection = (entry: MonsterIndexEntry, section: Section) => {
    // Sanity: only route Resume when the slot is truly the caller's active draft.
    if (activeDraft?.monsterId === entry.monsterId && activeDraft.section === section) {
      resumeDraft();
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsBusy(true);
    try {
      await backendAPI.delete(`/monsters/${deleteTarget.monsterId}`);
      setDeleteTarget(null);
      await refreshMainApp();
    } catch (error) {
      setErrorMessage(dispatch, error as ErrorType);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div
      role="tabpanel"
      id="monster-mash-tab-create"
      aria-labelledby="monster-mash-tab-btn-create"
      className="flex flex-col gap-6 py-6 max-w-5xl mx-auto"
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
          disabled={isBusy || !!activeDraft}
        >
          <span aria-hidden="true" className="text-5xl">
            ➕
          </span>
          <span className="h4">Create New Monster</span>
          <span className="p2 text-gray-600 text-center">
            {activeDraft
              ? "Finish or abandon your current section first."
              : "Server picks your section at random — head, torso, or legs."}
          </span>
        </button>

        {/* Resume tile (only when the caller holds a draft). */}
        {activeDraft && (
          <button
            type="button"
            className="card p-6 flex flex-col items-center justify-center gap-2 min-h-[220px] border-2 border-amber-400"
            onClick={resumeDraft}
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
            onJoin={(section) => joinSection(entry, section)}
            onResume={(section) => resumeSection(entry, section)}
            onAdminDelete={() => setDeleteTarget(entry)}
            isBusy={isBusy}
          />
        ))}
      </div>

      {sortedRoster.length === 0 && !activeDraft && (
        <p className="p2 text-center text-gray-600">
          No monsters in progress yet — smash "Create New Monster" to start one.
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
