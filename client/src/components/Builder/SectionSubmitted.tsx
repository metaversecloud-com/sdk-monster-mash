import { Section } from "@shared/types/index";
import { useBusy } from "@/context/BusyContext";
import { SectionLayeredImage } from "./SectionLayeredImage";

interface SectionSubmittedProps {
  section: Section;
  isComplete: boolean;
  composedName?: string | null;
  nameToken: string;
  /** All three contributor display names in order (head, torso, legs). Complete variant only. */
  contributorNames?: string[];
  /** Composited monster PNG URL. Complete variant only; null while finalize is retrying. */
  imageUrl?: string | null;
  /** Just-submitted picks — used for a layered preview on the "not complete" screen. */
  picks?: { [categoryId: string]: string };
  /** How many sections still need a contributor to finish this monster. Used in the "not complete" copy. */
  sectionsRemaining?: number;
  onBackToMonsterMash: () => void;
}

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
  picks,
  sectionsRemaining,
  onBackToMonsterMash,
}: SectionSubmittedProps) => {
  const { isBusy } = useBusy();
  if (isComplete) {
    const attribution = (contributorNames ?? []).filter(Boolean).join(" · ");
    return (
      <div className="flex flex-col items-center gap-2  text-center">
        <h5 className="text-gray-700 uppercase">Monster Mash</h5>
        <h2 className="h2 text-green-700 text-semibold relative">IT'S ALIVE!</h2>
        <p className="p2">Your section finished the monster!</p>

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

        {composedName && <h3 className="pt-2">{composedName}</h3>}
        {attribution && <p className="p2 text-gray-600">by {attribution}</p>}

        <ul className="text-sm text-gray-600 w-full text-left flex flex-col gap-2 p-2">
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
            <span className="text-xs text-amber-700 ">if enough are finished — otherwise the one after</span>
          </li>
        </ul>

        {imageUrl && (
          <>
            <a
              className="btn"
              href={imageUrl}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={`Open ${composedName ?? "monster"} PNG in a new tab`}
            >
              Download PNG
            </a>
            <p className="text-xs text-red-600">
              opens the image in a new browser tab to save — not an in-app download
            </p>
          </>
        )}

        <button className="btn btn-outline w-full" onClick={onBackToMonsterMash} disabled={isBusy}>
          Back to Monster Mash
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <h5 className="text-gray-700 uppercase">Monster Mash</h5>
      <h2 className="h2 text-green-700 capitalize">{section} submitted!</h2>
      <p className="p1">
        Nice work
        {typeof sectionsRemaining === "number" && sectionsRemaining > 0 && (
          <>
            {" "}
            — {sectionsRemaining} {sectionsRemaining === 1 ? "section" : "sections"} to go
          </>
        )}
      </p>
      {picks && (
        <SectionLayeredImage
          section={section}
          picks={picks}
          containerClassName="overflow-hidden w-full h-[190px] rounded-2xl border-2 border-taupe-500 bg-white mx-auto"
          imgStyle={{ height: "250px", marginTop: section === "head" ? "0px" : section === "torso" ? "-75px" : "-5px" }}
          ariaLabel={`your submitted ${section}`}
        />
      )}
      <div className="card p-4 flex flex-col gap-2 max-w-sm">
        <p className="p2 text-gray-600">Name so far:</p>
        <p className="h4">
          {section === "head" ? nameToken : "___"} {section === "torso" ? nameToken : "___"}{" "}
          {section === "legs" ? nameToken : "___"}
        </p>
      </div>
      <button className="btn" onClick={onBackToMonsterMash} disabled={isBusy}>
        Back to Monster Mash
      </button>
    </div>
  );
};

export default SectionSubmitted;
