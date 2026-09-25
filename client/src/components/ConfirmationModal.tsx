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
  /**
   * Optional cancel-button ACTION. Fires when the cancel button is clicked,
   * BEFORE the modal closes. Use this when the cancel button carries its
   * own side-effect (e.g. `ClaimSwitchModal` where cancel = "resume my
   * current section"). Omit when cancel is just "close the modal".
   *
   * Not fired on X / backdrop / Escape — those are pure dismiss.
   */
  handleOnCancel?: () => void;
  /**
   * State-close only — sets the caller's `show...` flag back to false.
   * Fired by the modal itself after ANY button click (confirm or cancel)
   * so the caller doesn't have to remember to close in every handler.
   * Also fired by the X / backdrop / Escape when no separate
   * `handleOnDismiss` is supplied — the common case where "close" and
   * "dismiss" mean the same thing.
   */
  handleToggleShowConfirmationModal: () => void;
  /**
   * Optional dismiss handler for the X button, backdrop click, and Escape
   * key. Provide this when "close without answering" is a distinct outcome
   * from `handleToggleShowConfirmationModal` (rare — usually they're the
   * same). If omitted, all three of those exits fall back to
   * `handleToggleShowConfirmationModal`.
   */
  handleOnDismiss?: () => void;
  /** Primary action label. Defaults to "Yes". */
  confirmLabel?: string;
  /** Cancel action label. Defaults to "No". */
  cancelLabel?: string;
  /**
   * Style of the confirm button.
   *   - "danger" (default) → `btn btn-danger` — irreversible actions
   *     (delete monster, reset leaderboard, end vote, discard picks, etc.)
   *   - "primary"          → `btn` — affirmative next-step actions (Submit
   *     Section, Continue, etc.) where the confirm isn't destructive.
   */
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

  // Escape-to-dismiss. Registered per-mount so multiple stacked modals
  // don't fight — the top one gets the event because React portals mount
  // in DOM order (last mounted is top-most in event capture).
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
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-header flex gap-2 grid-cols-2">
          <h4 className="flex-grow text-left">{title}</h4>
          <a className="pt-2 cursor-pointer" onClick={onDismiss} aria-label="Close" title="Close">
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
