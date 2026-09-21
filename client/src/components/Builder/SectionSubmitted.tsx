import { Section } from "@shared/types/index";

interface SectionSubmittedProps {
  section: Section;
  isComplete: boolean;
  composedName?: string | null;
  nameToken: string;
  /** All three contributor display names in order (head, torso, legs). Complete variant only. */
  contributorNames?: string[];
  /** Composited monster PNG URL. Complete variant only; null while finalize is retrying. */
  imageUrl?: string | null;
  onBackToMonsterMash: () => void;
}

const SECTION_LABELS: Record<Section, string> = {
  head: "Head",
  torso: "Torso",
  legs: "Legs",
};

/**
 * Post-submit screen. Two variants (from mockups image15/image19 + image26):
 *   - Section submitted (not complete yet) — "Name so far:" placeholder.
 *   - Complete — real "IT'S ALIVE!" moment: composed art, name, attribution,
 *     three ✓ bullets (Placed in the world / Added to the gallery / Entered
 *     in the next vote), Download PNG (opens PNG in new tab), Back.
 */
export const SectionSubmitted = ({
  section,
  isComplete,
  composedName,
  nameToken,
  contributorNames,
  imageUrl,
  onBackToMonsterMash,
}: SectionSubmittedProps) => {
  if (isComplete) {
    const attribution = (contributorNames ?? []).filter(Boolean).join(" · ");
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center max-w-md mx-auto">
        <div className="relative w-full flex justify-center">
          <div aria-hidden="true" className="absolute inset-0 pointer-events-none flex justify-around">
            <span className="text-2xl">🎉</span>
            <span className="text-2xl">🎊</span>
            <span className="text-2xl">✨</span>
            <span className="text-2xl">🎉</span>
          </div>
          <h2 className="h2 text-green-700 relative">IT'S ALIVE!</h2>
        </div>
        <p className="p1">Your section finished the monster!</p>

        {imageUrl ? (
          <img
            src={imageUrl}
            alt={composedName ? `${composedName} composed monster` : "composed monster"}
            className="w-56 h-72 object-contain rounded-2xl bg-gray-50 border"
          />
        ) : (
          <div className="w-56 h-72 rounded-2xl bg-gray-50 border-2 border-dashed flex items-center justify-center text-gray-500 p-4">
            World drop is queued — refresh the app in a moment.
          </div>
        )}

        {composedName && <p className="h3">{composedName}</p>}
        {attribution && <p className="p2 text-gray-600">by {attribution}</p>}

        <ul className="w-full text-left flex flex-col gap-2 pl-4">
          <li className="flex items-center gap-2">
            <span className="text-green-700" aria-hidden="true">
              ✓
            </span>
            Placed in the world
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-700" aria-hidden="true">
              ✓
            </span>
            Added to the gallery
          </li>
          <li className="flex flex-col">
            <span className="flex items-center gap-2">
              <span className="text-green-700" aria-hidden="true">
                ✓
              </span>
              Entered in the next vote
            </span>
            <span className="text-xs text-amber-700 pl-6">
              if enough are finished — otherwise the one after
            </span>
          </li>
        </ul>

        {imageUrl && (
          <a
            className="btn"
            href={imageUrl}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={`Open ${composedName ?? "monster"} PNG in a new tab`}
          >
            Download PNG
          </a>
        )}
        <p className="text-xs text-red-600">
          opens the image in a new browser tab to save — not an in-app download
        </p>

        <button className="btn btn-outline w-full" onClick={onBackToMonsterMash}>
          Back to Monster Mash
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <h2 className="h2 text-green-700">Section submitted!</h2>
      <p className="p1">
        Your <span className="font-semibold">{SECTION_LABELS[section]}</span> is in.
      </p>
      <div className="card p-4 flex flex-col gap-2 max-w-sm">
        <p className="p2 text-gray-600">Name so far:</p>
        <p className="h4">
          {section === "head" ? nameToken : "___"} {section === "torso" ? nameToken : "___"}{" "}
          {section === "legs" ? nameToken : "___"}
        </p>
      </div>
      <button className="btn" onClick={onBackToMonsterMash}>
        Back to Monster Mash
      </button>
    </div>
  );
};

export default SectionSubmitted;
