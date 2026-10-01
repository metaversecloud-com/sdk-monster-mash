import { ConfirmationModal } from "../ConfirmationModal.js";

interface NoFeetModalProps {
  onKeep: () => void;
  onUseNewLegs: () => void;
}

/**
 * Fires when the user picks a `legs.legs` part whose `supportsFeet` is false while `legs.feet` is a real part.
 */
export const NoFeetModal = ({ onKeep, onUseNewLegs }: NoFeetModalProps) => {
  return (
    <ConfirmationModal
      title="Those legs can't wear feet."
      message="Keep your current feet, or swap for the new legs and clear the feet pick?"
      confirmLabel="Use new legs"
      cancelLabel="Keep feet"
      confirmVariant="primary"
      handleOnConfirm={onUseNewLegs}
      handleToggleShowConfirmationModal={onKeep}
    />
  );
};

export default NoFeetModal;
