import { MonsterIndexEntry, Section } from "@shared/types/index";
import { SectionLayeredImage } from "@/components/Builder/SectionLayeredImage";

interface SectionSlotProps {
  section: Section;
  entry: MonsterIndexEntry;
  callerProfileId: string;
  callerContributed: boolean; // caller has ANY section submitted on this monster
  /**
   * True when the caller's `activeDraft` (an in-progress lock, not yet
   * submitted) points at THIS monster. Blocks the Join button on this
   * monster's other available slots ("one section per monster") and lets
   * the locked-by-me slot expose a Cancel affordance.
   */
  callerHasDraftHere?: boolean;
  /** Caller's saved picks for THIS monster/section — used to render a layered preview. */
  callerPicks?: { [categoryId: string]: string };
  onJoin: () => void;
  onResume: () => void;
  onCancel?: () => void;
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
 *
 * When the caller has an in-progress claim on this monster (`callerHasDraftHere`):
 *   - the locked-by-me slot shows Resume AND Cancel (spec: no need to open
 *     the Builder just to abandon)
 *   - other available slots on this monster show the "one section per
 *     monster" text instead of a Join button — same treatment as when they
 *     already submitted a section here.
 */
export const SectionSlot = ({
  section,
  entry,
  callerProfileId,
  callerContributed,
  callerHasDraftHere,
  callerPicks,
  onJoin,
  onResume,
  onCancel,
  isBusy,
}: SectionSlotProps) => {
  const slot = entry.sections?.[section];
  const status = slot?.status ?? "available";
  const contributorName = slot?.contributorDisplayName;
  const mine = slot?.contributorProfileId === callerProfileId;
  // "One per monster" text fires whenever the caller has SOME stake here —
  // either a submitted contribution or a currently-locked draft.
  const lockedIntoThisMonster = callerContributed || !!callerHasDraftHere;

  if (status === "available" || status === "locked") {
    return (
      <div
        className={`flex items-center gap-1 rounded-xl p-2 min-h-[92px] w-full ${
          mine ? "border-2 border-amber-400 bg-amber-50" : "border-2 border-dashed border-gray-300"
        }`}
      >
        <div
          className={`w-[100px] h-[100px] flex shrink-0 items-center justify-center rounded border-2 bg-white mr-2 text-2xl ${
            mine ? "border-2 border-amber-400 bg-amber-50" : "border-2 border-dashed border-gray-300"
          }`}
        >
          <span aria-hidden="true" className="text-2xl text-gray-500">
            {status === "locked" ? "🔒" : "?"}
          </span>
        </div>
        <div className="flex flex-col gap-1 my-auto">
          <p className="text-md text-gray-500">
            {SECTION_LABELS[section]} - {status === "locked" ? "locked" : "available"}
          </p>
          {status === "available" && !mine ? (
            lockedIntoThisMonster ? (
              <p className="text-[10px] text-gray-500">You can only contribute one section per monster</p>
            ) : (
              <button className="btn text-xs py-1 px-2" onClick={onJoin} disabled={isBusy}>
                Join
              </button>
            )
          ) : status === "locked" && mine ? (
            <div className="flex flex-wrap gap-1">
              <button className="btn text-xs py-1 px-2" onClick={onResume} disabled={isBusy}>
                Resume
              </button>
              {onCancel && (
                <button className="btn btn-outline text-xs py-1 px-2" onClick={onCancel} disabled={isBusy}>
                  Cancel
                </button>
              )}
            </div>
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
      <div className="w-[100px] h-[100px] flex items-center justify-center rounded border-2 border-green-500 bg-white mr-2">
        {mine && callerPicks ? (
          <SectionLayeredImage
            section={section}
            picks={callerPicks}
            containerClassName="w-[100px] h-[100px] overflow-hidden"
            imgStyle={{
              height: "140px",
              marginTop: section === "head" ? "0px" : section === "torso" ? "-45px" : "-55px",
            }}
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
