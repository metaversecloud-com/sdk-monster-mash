import { useEffect, useState } from "react";

export type ConfirmVariant = "primary" | "danger";

const CONFIRM_CLASS: Record<ConfirmVariant, string> = {
  primary: "btn",
  danger: "btn btn-danger",
};

export const ConfirmationModal = ({
  title,
  message,
  handleOnConfirm,
  handleOnCancel,
  handleToggleShowConfirmationModal,
  handleOnDismiss,
  confirmLabel = "Yes",
  cancelLabel = "No",
  confirmVariant = "danger",
}: {
  title: string;
  message: string;
  handleOnConfirm: () => void;
  handleOnCancel?: () => void;
  handleToggleShowConfirmationModal: () => void;
  handleOnDismiss?: () => void;
  /** Primary action label. Defaults to "Yes". */
  confirmLabel?: string;
  /** Cancel action label. Defaults to "No". */
  cancelLabel?: string;
  confirmVariant?: ConfirmVariant;
}) => {
  const [areButtonsDisabled, setAreButtonsDisabled] = useState(false);
  const dismiss = handleOnDismiss ?? handleToggleShowConfirmationModal;

  const onConfirm = () => {
    setAreButtonsDisabled(true);
    handleOnConfirm();
    handleToggleShowConfirmationModal();
  };

  const onCancel = () => {
    setAreButtonsDisabled(true);
    handleOnCancel?.();
    handleToggleShowConfirmationModal();
  };

  const onDismiss = () => {
    if (areButtonsDisabled) return;
    setAreButtonsDisabled(true);
    dismiss();
  };

  // Escape-to-dismiss
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="modal-container"
      onClick={(e) => {
        // Click on the backdrop (not the inner modal) dismisses.
        if (e.target === e.currentTarget) onDismiss();
      }}
      role="presentation"
    >
      <div className="modal max-w-[600px]" role="dialog" aria-modal="true">
        <div className="modal-header flex gap-2 grid-cols-2">
          <h4 className="flex-grow text-left">{title}</h4>
          <a className="pt-1 cursor-pointer" onClick={onDismiss} aria-label="Close" title="Close">
            <img src="https://sdk-style.s3.amazonaws.com/icons/x.svg" alt="" aria-hidden="true" />
          </a>
        </div>
        <p>{message}</p>
        <div className="actions">
          <button id="close" className="btn btn-outline" onClick={onCancel} disabled={areButtonsDisabled}>
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
