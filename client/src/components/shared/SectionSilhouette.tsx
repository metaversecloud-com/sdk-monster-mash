import { Section } from "@shared/types/index";

interface SectionSilhouetteProps {
  section: Section;
  /**
   * "light" → for use on light backgrounds (Create tab in-progress cards).
   * "dark"  → for use on dark backgrounds (Monster Builder LayeredPreview,
   *           SectionSlot inside the dark app modal).
   */
  variant: "light" | "dark";
  className?: string;
  alt?: string;
}

/**
 * Section silhouette used in place of "?" when a section's art is hidden
 * (peer submitted, but caller hasn't unlocked the reveal). Assets live in
 * `client/public/assets/{section}-{variant}.png` per the v006 mockup.
 */
export const SectionSilhouette = ({ section, variant, className, alt }: SectionSilhouetteProps) => {
  return (
    <img
      src={`/assets/${section}-${variant}.png`}
      alt={alt ?? `${section} silhouette (art hidden)`}
      className={className}
    />
  );
};

export default SectionSilhouette;
