import { CSSProperties } from "react";
import { Section } from "@shared/types/index";
import { SECTION_CROP, makePartUrl, useContent } from "@/utils";

interface SectionLayeredImageProps {
  section: Section;
  picks: { [categoryId: string]: string };
  /** Additional class names for the outer container. */
  containerClassName?: string;
  /** Alt text for accessibility (aria-label on the container's role="img"). */
  imgStyle?: CSSProperties;
  /** Additional class names for the images. */
  ariaLabel?: string;
}

/**
 * Renders one section's picks as a client-side layered preview — same
 * approach the drawer's LayeredPreview uses. Extracted so SectionSlot
 * (Create tab) and SectionSubmitted (post-submit screen) can render a
 * caller's completed section without a per-section server-side compose.
 *
 * The compositor stacks each layer in LAYER_ORDER with `object-fit: cover`
 * + the section's `objectPosition` so the empty regions of the shared
 * 200×350 canvas get cropped out.
 */
export const SectionLayeredImage = ({
  section,
  picks,
  containerClassName = "",
  imgStyle,
  ariaLabel,
}: SectionLayeredImageProps) => {
  const { categoriesBySection, layerOrder, partById } = useContent();
  const partUrl = makePartUrl(partById);
  const crop = SECTION_CROP[section];

  const layerToPick = new Map<string, string>();
  for (const [catId, pickId] of Object.entries(picks)) {
    const cat = categoriesBySection[section].find((c) => c.id === catId);
    if (!cat) continue;
    layerToPick.set(cat.layerKey, pickId);
  }

  return (
    <div
      className={`relative  ${containerClassName}`}
      role="img"
      aria-label={ariaLabel ?? `${section} layered preview`}
    >
      {layerOrder.map((layerKey) => {
        const pickId = layerToPick.get(layerKey);
        const url = partUrl(pickId);
        if (!url) return null;
        return (
          <img
            key={layerKey}
            src={url}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-contain"
            style={{ objectPosition: crop.objectPosition, ...imgStyle }}
          />
        );
      })}
    </div>
  );
};

export default SectionLayeredImage;
