import { MonsterIndexEntry, Section } from "@shared/types/index";

interface SectionSlotProps {
  section: Section;
  entry: MonsterIndexEntry;
  callerProfileId: string;
  callerContributed: boolean; // caller has ANY section submitted on this monster
  onJoin: () => void;
  onResume: () => void;
  isBusy?: boolean;
}

const SECTION_LABELS: Record<Section, string> = {
  head: "Head",
  torso: "Torso",
  legs: "Legs",
};

/**
 * One horizontal slot inside a MonsterCard. Renders per spec §Create tab +
 * mockup image11:
 *   - available → grey silhouette + [Join]
 *   - locked-by-caller (unexpired) → "your claim" + [Resume]
 *   - locked-by-other → contributor pill, no interaction
 *   - done + caller has contributed to this monster → real art (peer-reveal)
 *   - done + caller has NOT contributed here → grey ? placeholder w/ contributor name
 */
export const SectionSlot = ({
  section,
  entry,
  callerProfileId,
  callerContributed,
  onJoin,
  onResume,
  isBusy,
}: SectionSlotProps) => {
  const slot = entry.sections?.[section];
  const status = slot?.status ?? "available";
  const contributorName = slot?.contributorDisplayName;

  if (status === "available") {
    return (
      <div className="flex flex-col items-center gap-1 border-2 border-dashed border-gray-300 rounded-xl p-2 min-h-[92px] w-full">
        <span className="text-xs text-gray-500">{SECTION_LABELS[section]}</span>
        <span aria-hidden="true" className="text-2xl">
          ·
        </span>
        <button className="btn btn-outline text-xs py-1 px-2" onClick={onJoin} disabled={isBusy}>
          Join
        </button>
      </div>
    );
  }

  if (status === "locked") {
    const mine = slot?.contributorProfileId === callerProfileId;
    return (
      <div
        className={`flex flex-col items-center gap-1 rounded-xl p-2 min-h-[92px] w-full ${
          mine ? "border-2 border-amber-400 bg-amber-50" : "border-2 border-dashed border-gray-300"
        }`}
      >
        <span className="text-xs text-gray-500">{SECTION_LABELS[section]}</span>
        <span aria-hidden="true" className="text-2xl">
          🔒
        </span>
        {mine ? (
          <button className="btn text-xs py-1 px-2" onClick={onResume} disabled={isBusy}>
            Resume
          </button>
        ) : (
          <span className="text-[10px] text-gray-700 truncate max-w-full" title={contributorName}>
            {contributorName ?? "in progress"}
          </span>
        )}
      </div>
    );
  }

  // status === "done"
  const revealUrl = callerContributed ? entry.inProgressSections?.[section]?.sectionImageUrl : undefined;
  return (
    <div className="flex flex-col items-center gap-1 border-2 border-green-500 bg-green-50 rounded-xl p-2 min-h-[92px] w-full">
      <span className="text-xs text-green-700">{SECTION_LABELS[section]}</span>
      {revealUrl ? (
        <img src={revealUrl} alt={`${contributorName ?? "peer"}'s ${section}`} className="w-14 h-10 object-contain" />
      ) : (
        <span aria-hidden="true" className="text-2xl">
          {callerContributed ? "🎭" : "?"}
        </span>
      )}
      <span className="text-[10px] text-gray-700 truncate max-w-full" title={contributorName}>
        {contributorName ?? "done"}
      </span>
    </div>
  );
};

export default SectionSlot;
