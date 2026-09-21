import { useState } from "react";

export const ConfirmationModal = ({
  title,
  message,
  handleOnConfirm,
  handleToggleShowConfirmationModal,
  confirmLabel = "Yes",
  cancelLabel = "No",
}: {
  title: string;
  message: string;
  handleOnConfirm: () => void;
  handleToggleShowConfirmationModal: () => void;
  /** Primary action label. Defaults to "Yes". */
  confirmLabel?: string;
  /** Cancel action label. Defaults to "No". */
  cancelLabel?: string;
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
          <button className="btn btn-danger-outline" onClick={onConfirm} disabled={areButtonsDisabled}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
