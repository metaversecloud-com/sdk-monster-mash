import { MonsterIndexEntry, Section, SECTIONS } from "@shared/types/index";
import { useBusy } from "@/context/BusyContext";
import { SectionSlot } from "./SectionSlot.js";

interface MonsterCardProps {
  entry: MonsterIndexEntry;
  callerProfileId: string;
  callerIsAdmin: boolean;
  callerHasActiveDraft: boolean;
  /** Caller's picks per section for THIS monster (from `contributedDrafts[monsterId]`). */
  callerDrafts?: Partial<Record<Section, { picks: { [categoryId: string]: string }; nameToken: string }>>;
  onJoin: (section: Section) => void;
  onResume: (section: Section) => void;
  onAdminDelete: () => void;
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
  callerDrafts,
  onJoin,
  onResume,
  onAdminDelete,
}: MonsterCardProps) => {
  const { isBusy } = useBusy();
  const contributedHere = (entry.contributorProfileIds ?? []).includes(callerProfileId);

  return (
    <div className="card p-3 flex flex-col gap-2 min-h-[220px] relative">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">Art stays hidden until complete</span>
        {callerIsAdmin && (
          <a
            className={`text-right ${isBusy ? "opacity-40 pointer-events-none" : ""}`}
            aria-label="Delete this monster in progress"
            onClick={() => {
              if (isBusy) return;
              onAdminDelete();
            }}
          >
            <img src="https://sdk-style.s3.amazonaws.com/icons/delete.svg" />
          </a>
        )}
      </div>

      <div className="grid gap-2">
        {SECTIONS.map((s) => {
          const slotBusy =
            isBusy || (callerHasActiveDraft && entry.sections?.[s]?.contributorProfileId !== callerProfileId);
          return (
            <SectionSlot
              key={s}
              section={s}
              entry={entry}
              callerProfileId={callerProfileId}
              callerContributed={contributedHere}
              callerPicks={callerDrafts?.[s]?.picks}
              onJoin={() => onJoin(s)}
              onResume={() => onResume(s)}
              isBusy={slotBusy}
            />
          );
        })}
      </div>
    </div>
  );
};

export default MonsterCard;
