import { MonsterIndexEntry, Section, SECTIONS } from "@shared/types/index";
import { SectionSlot } from "./SectionSlot.js";

interface MonsterCardProps {
  entry: MonsterIndexEntry;
  callerProfileId: string;
  callerIsAdmin: boolean;
  callerHasActiveDraft: boolean;
  onJoin: (section: Section) => void;
  onResume: (section: Section) => void;
  onAdminDelete: () => void;
  isBusy?: boolean;
}

/**
 * One in-progress monster card on the Create tab. Renders three horizontal
 * section slots + optional admin trash. Cards are ordered by CreateTab.
 */
export const MonsterCard = ({
  entry,
  callerProfileId,
  callerIsAdmin,
  callerHasActiveDraft,
  onJoin,
  onResume,
  onAdminDelete,
  isBusy,
}: MonsterCardProps) => {
  const contributedHere = (entry.contributorProfileIds ?? []).includes(callerProfileId);

  const availableCount = SECTIONS.reduce(
    (n, s) => (entry.sections?.[s]?.status === "available" ? n + 1 : n),
    0,
  );
  const doneCount = SECTIONS.reduce(
    (n, s) => (entry.sections?.[s]?.status === "done" ? n + 1 : n),
    0,
  );

  return (
    <div className="card p-3 flex flex-col gap-3 min-h-[220px] relative">
      {callerIsAdmin && (
        <button
          type="button"
          className="btn btn-icon absolute top-2 right-2 text-red-700"
          aria-label="Delete this monster in progress"
          onClick={onAdminDelete}
          disabled={isBusy}
        >
          🗑
        </button>
      )}

      <div className="flex items-center justify-between">
        <h4 className="h4">Monster {entry.monsterId.slice(0, 6)}</h4>
        <span className="text-xs text-gray-500">
          {doneCount}/3 done · {availableCount} open
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {SECTIONS.map((s) => (
          <SectionSlot
            key={s}
            section={s}
            entry={entry}
            callerProfileId={callerProfileId}
            callerContributed={contributedHere}
            onJoin={() => onJoin(s)}
            onResume={() => onResume(s)}
            isBusy={callerHasActiveDraft && entry.sections?.[s]?.contributorProfileId !== callerProfileId}
          />
        ))}
      </div>
    </div>
  );
};

export default MonsterCard;
