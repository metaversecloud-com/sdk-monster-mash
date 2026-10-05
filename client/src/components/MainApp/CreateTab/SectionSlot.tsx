import { MonsterIndexEntry, Section } from "@shared/types/index";
import { SectionLayeredImage } from "@/components/Builder/SectionLayeredImage";
import { SectionSilhouette } from "@/components/shared/SectionSilhouette";

interface SectionSlotProps {
  section: Section;
  entry: MonsterIndexEntry;
  callerProfileId: string;
  callerContributed: boolean; // caller has ANY section submitted on this monster
  callerHasDraftHere?: boolean;
  /** Caller's saved picks for THIS monster/section - used to render a layered preview. */
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
 * the whole monster finalizes.
 *
 * When the caller has an in-progress claim on this monster (`callerHasDraftHere`):
 *   - the locked-by-me slot shows Resume AND Cancel
 *   - other available slots on this monster show the "one section per
 *     monster" text instead of a Join button - same treatment as when they
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
  // "One per monster" text fires whenever the caller has SOME stake here -
  // either a submitted contribution or a currently-locked draft.
  const lockedIntoThisMonster = callerContributed || !!callerHasDraftHere;

  if (mine && status === "locked") {
    return (
      <div className="flex items-center gap-1 rounded-xl p-2 px-3 min-h-[102px] mm-border-1 mm-border-amber bg-white">
        <div className="h-full flex flex-col justify-between">
          <p className="text-md mm-text-on-card">{SECTION_LABELS[section]} - being built by YOU</p>
          <p className="mm-text-amber-dark text-[9px] mb-1">
            Your progress is saved! Your claim frees up after 30 min idle.
          </p>
          <div className="flex gap-2">
            <button className="btn mm-btn-amber mm-btn-sm" onClick={onResume} disabled={isBusy}>
              Resume
            </button>
            {onCancel && (
              <button className="btn btn-outline mm-btn-sm" onClick={onCancel} disabled={isBusy}>
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (status === "done") {
    // Reveal rule: show the composed image whenever we HAVE picks for this
    // slot. The caller's own section is always visible via `callerPicks`
    // sourced from their own `contributedDrafts`. Peer sections become
    // visible ONCE THE CALLER HAS CONTRIBUTED — the server bundles peer
    // picks into the caller's drafts for monsters they're already on, so
    // `callerPicks` is populated for peer slots too. Non-contributors fall
    // through to the silhouette + "hidden until you submit yours" state.
    const canShowArt = !!callerPicks;
    return (
      <div className="flex items-center gap-1 rounded-xl p-2 h-[102px] w-full bg-white">
        <div className="w-[100px] h-[100px] flex items-center justify-center rounded bg-white mr-2 overflow-hidden">
          {canShowArt ? (
            <SectionLayeredImage
              section={section}
              picks={callerPicks!}
              containerClassName="w-[100px] h-[100px] overflow-hidden"
              imgStyle={{
                height: "140px",
                marginTop: section === "head" ? "0px" : section === "torso" ? "-40px" : "-50px",
              }}
              ariaLabel={mine ? `your ${section}` : `${contributorName ?? "peer"}'s ${section}`}
            />
          ) : (
            <SectionSilhouette section={section} variant="light" className="w-[80px] h-[80px] object-contain" />
          )}
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-md mm-text-on-card">{SECTION_LABELS[section]} - DONE</p>
          {canShowArt ? (
            <p className="mm-text-xs mm-text-on-card-muted">
              {mine ? "Art is visible to you" : "Visible because you contributed"}
            </p>
          ) : (
            <p className="mm-text-xs mm-text-on-card-muted">hidden until you submit yours</p>
          )}
          <p className="mm-text-xs mm-text-on-card-muted truncate max-w-full" title={contributorName}>
            {contributorName ?? "done"} ·{" "}
            {slot?.submittedAt ? new Date(slot.submittedAt).toLocaleDateString() : "unknown date"}
          </p>
        </div>
      </div>
    );
  }

  // status === available or locked but not mine
  return (
    <div className="flex items-center gap-1 rounded-xl p-2 min-h-[102px] text-center border border-dashed border-gray-300">
      <div className="flex flex-col gap-1 mx-auto px-4">
        <p className="text-md mm-text-on-card">
          {SECTION_LABELS[section]} - <span className="uppercase">{status}</span>
        </p>
        {status === "available" ? (
          <>
            {lockedIntoThisMonster ? (
              <p className="mm-text-xs mm-text-on-card-muted">You can only contribute one section per monster</p>
            ) : (
              <button className="btn mm-btn-sm mx-auto" onClick={onJoin} disabled={isBusy}>
                Join
              </button>
            )}
          </>
        ) : (
          <p className="mm-text-xs mm-text-on-card-muted truncate max-w-full" title={contributorName}>
            {contributorName ?? "in progress"} ·{" "}
            {slot?.lockedAt ? new Date(slot.lockedAt).toLocaleDateString() : "unknown date"}
          </p>
        )}
      </div>
    </div>
  );
};

export default SectionSlot;
