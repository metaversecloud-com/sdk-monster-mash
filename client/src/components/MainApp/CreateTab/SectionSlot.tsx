import { MonsterIndexEntry, Section } from "@shared/types/index";
import { SectionLayeredImage } from "@/components/Builder/SectionLayeredImage";

interface SectionSlotProps {
  section: Section;
  entry: MonsterIndexEntry;
  callerProfileId: string;
  callerContributed: boolean; // caller has ANY section submitted on this monster
  /** Caller's saved picks for THIS monster/section — used to render a layered preview. */
  callerPicks?: { [categoryId: string]: string };
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
 * One horizontal slot inside a MonsterCard. Renders a dashed placeholder for
 * available, a locked indicator for in-progress, and a green border for done.
 *
 * If the CALLER's own section is done, the caller's saved picks (from
 * `contributedDrafts` on their visitor data) drive a client-side layered
 * preview — no server-side per-section compose. Peer-completed sections
 * always show "?" until the whole monster finalizes.
 */
export const SectionSlot = ({
  section,
  entry,
  callerProfileId,
  callerContributed,
  callerPicks,
  onJoin,
  onResume,
  isBusy,
}: SectionSlotProps) => {
  const slot = entry.sections?.[section];
  const status = slot?.status ?? "available";
  const contributorName = slot?.contributorDisplayName;
  const mine = slot?.contributorProfileId === callerProfileId;

  if (status === "available") {
    return (
      <div className="flex flex-col items-center gap-1 border-2 border-dashed border-gray-300 rounded-xl p-2 min-h-[92px] w-full">
        <span className="text-md text-gray-600">{SECTION_LABELS[section]}</span>
        {callerContributed ? (
          <span className="text-[10px] text-gray-500 text-center leading-tight my-auto">
            one section
            <br />
            per monster
          </span>
        ) : (
          <button className="btn text-xs py-1 px-2" onClick={onJoin} disabled={isBusy}>
            Join
          </button>
        )}
      </div>
    );
  }

  if (status === "locked") {
    return (
      <div
        className={`flex items-center gap-1 rounded-xl p-2 min-h-[92px] w-full ${
          mine ? "border-2 border-amber-400 bg-amber-50" : "border-2 border-dashed border-gray-300"
        }`}
      >
        <div
          className={`w-20 h-20 flex items-center justify-center rounded border-2 bg-white mr-2 text-2xl ${
            mine ? "border-2 border-amber-400 bg-amber-50" : "border-2 border-dashed border-gray-300"
          }`}
        >
          🔒
        </div>
        <div className="flex flex-col gap-1 my-auto">
          <span className="text-md text-gray-500">{SECTION_LABELS[section]} - locked</span>
          {mine ? (
            <button className="btn text-xs py-1 px-2" onClick={onResume} disabled={isBusy}>
              Resume
            </button>
          ) : (
            <p className="text-[10px] text-gray-700 truncate max-w-full" title={contributorName}>
              {contributorName ?? "in progress"}
            </p>
          )}
        </div>
      </div>
    );
  }

  // status === "done"
  return (
    <div className="flex items-center gap-1 border-2 border-green-500 bg-green-50 rounded-xl p-2 min-h-[92px] w-full">
      <div className="w-20 h-20 flex items-center justify-center rounded border-2 border-green-500 bg-white mr-2">
        {mine && callerPicks ? (
          <SectionLayeredImage
            section={section}
            picks={callerPicks}
            containerStyle={{ width: "90px", height: "90px" }}
            containerClassName="rounded"
            ariaLabel={`your ${section}`}
          />
        ) : (
          <span aria-hidden="true" className="text-2xl text-gray-500">
            ?
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1 my-auto">
        <p className="text-md text-green-700">
          {SECTION_LABELS[section]} - done
          <br />
          {mine ? (
            <span className="text-[10px]">Art is visible to you</span>
          ) : (
            <span className="text-[10px] text-gray-500">Art is hidden</span>
          )}
        </p>
        <span className="text-[10px] text-gray-700 truncate max-w-full" title={contributorName}>
          {contributorName ?? "done"} •{" "}
          {slot.submittedAt ? new Date(slot.submittedAt).toLocaleDateString() : "unknown date"}
        </span>
      </div>
    </div>
  );
};

export default SectionSlot;
