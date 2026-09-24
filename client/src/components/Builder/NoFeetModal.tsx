import { useBusy } from "@/context/BusyContext";

interface NoFeetModalProps {
  onKeep: () => void;
  onUseNewLegs: () => void;
}

/**
 * Mockup image5: legs-no-feet incompatibility. Fires when the user picks a
 * `legs.legs` part whose `supportsFeet` is false while `legs.feet` is a real
 * part. Buttons carry ACTUAL ICONS not names — big and unambiguous.
 */
export const NoFeetModal = ({ onKeep, onUseNewLegs }: NoFeetModalProps) => {
  const { isBusy } = useBusy();
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="no-feet-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="card w-[92%] max-w-sm p-6 flex flex-col gap-4">
        <h3 id="no-feet-title" className="h3 text-center">
          Those legs can't wear feet.
        </h3>
        <p className="p2 text-center text-gray-600">
          Keep your current feet, or swap for the new legs and clear the feet pick?
        </p>
        <div className="flex gap-2 justify-center">
          <button className="btn btn-outline flex flex-col items-center gap-1 p-3" onClick={onKeep} disabled={isBusy}>
            Keep feet
          </button>
          <button className="btn flex flex-col items-center gap-1 p-3" onClick={onUseNewLegs} disabled={isBusy}>
            Use new legs
          </button>
        </div>
      </div>
    </div>
  );
};

export default NoFeetModal;
