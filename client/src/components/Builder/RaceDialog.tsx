import { ConfirmationModal } from "../ConfirmationModal.js";

interface RaceDialogProps {
  onBackToList: () => void;
  onStartNew: () => void;
}

/**
 * Mockup image12: "Oops, that one was just claimed!" — surfaces when a
 * server response says 409 on claim or on submit-lock verification. Backed
 * by the shared `ConfirmationModal` so styling stays consistent.
 *
 * The "cancel" affordance is Back to the list (closes the modal), and the
 * "confirm" affordance kicks off a fresh POST /monsters/start.
 */
export const RaceDialog = ({ onBackToList, onStartNew }: RaceDialogProps) => {
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
