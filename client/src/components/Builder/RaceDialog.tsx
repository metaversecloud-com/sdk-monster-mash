import { useEffect } from "react";
import { ConfirmationModal } from "../ConfirmationModal.js";
import { playSfx } from "@/utils";

interface RaceDialogProps {
  onBackToList: () => void;
  onStartNew: () => void;
}

/**
 * "Oops, that one was just claimed!" surfaces when a
 * server response says 409 on claim or on submit-lock verification.
 * The "cancel" affordance is Back to the list (closes the modal), and the
 * "confirm" affordance kicks off a fresh POST /monsters/start.
 */
export const RaceDialog = ({ onBackToList, onStartNew }: RaceDialogProps) => {
  // Play the race-collision sfx once on mount (same cue the Create tab
  // fires inline when `/claim` returns 409 — this is the Builder-side
  // path where the race surfaces as a modal instead).
  useEffect(() => {
    playSfx("CLAIM_TAKEN");
  }, []);

  return (
    <ConfirmationModal
      title="Oops, that one was just claimed!"
      message="Someone else grabbed that section a second before you did. Pick another or start a fresh monster."
      confirmLabel="Start a new monster"
      cancelLabel="Back to the list"
      handleOnConfirm={onStartNew}
      handleToggleShowConfirmationModal={onBackToList}
    />
  );
};

export default RaceDialog;
