import { Section } from "@shared/types/index";

const SECTION_TITLES: Record<Section, string> = {
  head: "Head",
  torso: "Torso",
  legs: "Legs",
};

interface SubmitConfirmProps {
  section: Section;
  onConfirm: () => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

/**
 * Modal from mockup image8: "Submit this Monster Head?" with a primary
 * Submit button and a Keep Building cancel. Native <dialog> isn't ideal
 * (iframe chrome), so we render a role="dialog" overlay.
 */
export const SubmitConfirm = ({ section, onConfirm, onCancel, isSubmitting }: SubmitConfirmProps) => {
  const title = `Submit this Monster's ${SECTION_TITLES[section]}?`;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="submit-confirm-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="card w-[92%] max-w-sm p-6 flex flex-col gap-4">
        <h3 id="submit-confirm-title" className="h3 text-center">
          {title}
        </h3>
        <p className="p2 text-center text-gray-600">
          You cannot change it afterward - the monster keeps{" "}
          {SECTION_TITLES[section] === "head"
            ? "this head"
            : SECTION_TITLES[section] === "torso"
              ? "this torso"
              : "these legs"}{" "}
          forever!
        </p>
        <div className="flex flex-col gap-2">
          <button className="btn" disabled={isSubmitting} onClick={onConfirm}>
            {isSubmitting ? "Submitting…" : `Submit ${SECTION_TITLES[section]}`}
          </button>
          <button className="btn btn-outline" disabled={isSubmitting} onClick={onCancel}>
            Keep Building
          </button>
        </div>
      </div>
    </div>
  );
};

export default SubmitConfirm;
