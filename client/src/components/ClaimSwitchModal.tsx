import { Section } from "@shared/types/index";
import { ConfirmationModal } from "./ConfirmationModal.js";

interface ClaimSwitchModalProps {
  /** Section the caller currently holds (their activeDraft). */
  currentSection: Section;
  /** Section they're trying to join. */
  targetSection: Section;
  /** Resume the caller's existing draft — closes the modal + reopens the builder. */
  onResumeCurrent: () => void;
  /** Abandon the current claim and take the new section. */
  onAbandonAndJoin: () => void;
  /** Dismiss without picking either — modal disappears and nothing happens. */
  onDismiss: () => void;
}

const SECTION_LABELS: Record<Section, string> = {
  head: "head",
  torso: "torso",
  legs: "legs",
};

/**
 * Fires when the caller clicks Join on a section belonging to a DIFFERENT
 * monster than the one their activeDraft points at. Three exits:
 *   1. Confirm — abandon current + take the new section (destructive)
 *   2. Cancel — resume the existing claim (reopens the builder)
 *   3. Dismiss — X / backdrop / Escape; nothing changes server-side
 *
 * Backed by the shared `ConfirmationModal`:
 *   - `handleOnConfirm` gets the abandon+join action
 *   - `handleOnCancel` gets the resume action (fires when Cancel button
 *     is clicked)
 *   - `handleToggleShowConfirmationModal` is the pure state-close
 *     (`setPendingSwitch(null)`); the modal fires it after any button
 *     click AND on X / backdrop / Escape.
 */
export const ClaimSwitchModal = ({
  currentSection,
  targetSection,
  onResumeCurrent,
  onAbandonAndJoin,
  onDismiss,
}: ClaimSwitchModalProps) => {
  return (
    <ConfirmationModal
      title="You can only claim one section at a time"
      message={`You're currently building the ${SECTION_LABELS[currentSection]} of another monster. Finish or abandon that section before joining a new ${SECTION_LABELS[targetSection]}.`}
      confirmLabel={`Abandon & Join ${SECTION_LABELS[targetSection]}`}
      cancelLabel={`Resume ${SECTION_LABELS[currentSection]}`}
      handleOnConfirm={onAbandonAndJoin}
      handleOnCancel={onResumeCurrent}
      handleToggleShowConfirmationModal={onDismiss}
    />
  );
};

export default ClaimSwitchModal;
