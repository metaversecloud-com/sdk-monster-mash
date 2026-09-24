import { useState } from "react";

export type ConfirmVariant = "primary" | "danger";

const CONFIRM_CLASS: Record<ConfirmVariant, string> = {
  primary: "btn",
  danger: "btn btn-danger",
};

export const ConfirmationModal = ({
  title,
  message,
  handleOnConfirm,
  handleToggleShowConfirmationModal,
  confirmLabel = "Yes",
  cancelLabel = "No",
  confirmVariant = "danger",
}: {
  title: string;
  message: string;
  handleOnConfirm: () => void;
  handleToggleShowConfirmationModal: () => void;
  /** Primary action label. Defaults to "Yes". */
  confirmLabel?: string;
  /** Cancel action label. Defaults to "No". */
  cancelLabel?: string;
  /**
   * Style of the confirm button.
   *   - "danger" (default) → `btn btn-danger-outline` — irreversible actions
   *     (delete monster, reset leaderboard, end vote, discard picks, etc.)
   *   - "primary"          → `btn` — affirmative next-step actions (Submit
   *     Section, Continue, etc.) where the confirm isn't destructive.
   */
  confirmVariant?: ConfirmVariant;
}) => {
  const [areButtonsDisabled, setAreButtonsDisabled] = useState(false);

  const onConfirm = () => {
    setAreButtonsDisabled(true);
    handleOnConfirm();
    handleToggleShowConfirmationModal();
  };

  return (
    <div className="modal-container">
      <div className="modal">
        <h4>{title}</h4>
        <p>{message}</p>
        <div className="actions">
          <button
            id="close"
            className="btn btn-outline"
            onClick={handleToggleShowConfirmationModal}
            disabled={areButtonsDisabled}
          >
            {cancelLabel}
          </button>
          <button className={CONFIRM_CLASS[confirmVariant]} onClick={onConfirm} disabled={areButtonsDisabled}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
