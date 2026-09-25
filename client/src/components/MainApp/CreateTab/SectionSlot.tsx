import { MonsterIndexEntry, Section } from "@shared/types/index";
import { SectionLayeredImage } from "@/components/Builder/SectionLayeredImage";
import { SectionSilhouette } from "@/components/shared/SectionSilhouette";

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
        className={`flex items-center gap-1 rounded-xl p-2 min-h-[102px] text-center ${
          mine ? "border-l-4 mm-border-amber bg-white" : "border border-dashed border-gray-300"
        }`}
      >
        <div className="flex flex-col gap-1 mx-auto px-4">
          {status === "locked" && (
            <span aria-hidden="true" className="text-2xl mm-text-on-card-subtle mx-auto">
              🔒
            </span>
          )}
          <p className="text-md mm-text-on-card pb-1">
            {SECTION_LABELS[section]} — {status === "locked" ? "locked" : "AVAILABLE"}
          </p>
          {status === "available" && !mine ? (
            lockedIntoThisMonster ? (
              <p className="mm-text-xs mm-text-on-card-muted">You can only contribute one section per monster</p>
            ) : (
              <button className="btn mm-btn-sm mx-auto" onClick={onJoin} disabled={isBusy}>
                Join
              </button>
            )
          ) : status === "locked" && mine ? (
            <div className="flex flex-wrap gap-1">
              <button className="btn mm-btn-sm mx-auto" onClick={onResume} disabled={isBusy}>
                Resume
              </button>
              {onCancel && (
                <button className="btn btn-outline mm-btn-sm mx-auto" onClick={onCancel} disabled={isBusy}>
                  Cancel
                </button>
              )}
            </div>
          ) : (
            <p className="mm-text-xs mm-text-on-card-muted truncate max-w-full" title={contributorName}>
              {contributorName ?? "in progress"}
            </p>
          )}
        </div>
      </div>
    );
  }

  // status === "done"
  return (
    <div className="flex items-center gap-1 rounded-xl p-2 h-[102px] w-full bg-white">
      <div className="w-[100px] h-[100px] flex items-center justify-center rounded bg-white mr-2 overflow-hidden">
        {mine && callerPicks ? (
          <SectionLayeredImage
            section={section}
            picks={callerPicks}
            containerClassName="w-[100px] h-[100px] overflow-hidden"
            imgStyle={{
              height: "140px",
              marginTop: section === "head" ? "0px" : section === "torso" ? "-40px" : "-50px",
            }}
            ariaLabel={`your ${section}`}
          />
        ) : (
          <SectionSilhouette section={section} variant="light" className="w-[80px] h-[80px] object-contain" />
        )}
      </div>
      <div className="flex flex-col gap-1 my-auto">
        <p className="text-md mm-text-on-card">
          {SECTION_LABELS[section]} — done
          <br />
          {mine ? (
            <span className="mm-text-xs mm-text-on-card-muted">Art is visible to you</span>
          ) : (
            <span className="mm-text-xs mm-text-on-card-muted">hidden until you submit yours</span>
          )}
        </p>
        <span className="mm-text-xs mm-text-on-card-muted truncate max-w-full" title={contributorName}>
          {contributorName ?? "done"} ·{" "}
          {slot.submittedAt ? new Date(slot.submittedAt).toLocaleDateString() : "unknown date"}
        </span>
      </div>
    </div>
  );
};

export default SectionSlot;
