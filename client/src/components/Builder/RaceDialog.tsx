import { useBusy } from "@/context/BusyContext";

interface RaceDialogProps {
  onBackToList: () => void;
  onStartNew: () => void;
}

/**
 * Mockup image12: "Oops, that one was just claimed!" — surfaces when a
 * server response says 409 on claim or on submit-lock verification.
 */
export const RaceDialog = ({ onBackToList, onStartNew }: RaceDialogProps) => {
  const { isBusy } = useBusy();
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="race-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="card w-[92%] max-w-sm p-6 flex flex-col gap-4">
        <h3 id="race-dialog-title" className="h3 text-center">
          Oops, that one was just claimed!
        </h3>
        <p className="p2 text-center text-gray-600">
          Someone else grabbed that section a second before you did. Pick another or start a fresh monster.
        </p>
        <div className="flex flex-col gap-2">
          <button className="btn btn-outline" onClick={onBackToList} disabled={isBusy}>
            Back to the list
          </button>
          <button className="btn" onClick={onStartNew} disabled={isBusy}>
            Start a new monster
          </button>
        </div>
      </div>
    </div>
  );
};

export default RaceDialog;
