import { Section } from "@shared/types/index";

/**
 * Per-section crop hints for the Builder's PartGrid tiles and LayeredPreview
 * boxes. Every part PNG ships on the same 200×350 full-body canvas so the
 * server compositor can stack layers without repositioning; each section's
 * actual art only occupies a slice of that canvas, so displaying the full
 * PNG at square aspect leaves large empty regions (head has blank space
 * below, torso above AND below, legs above).
 *
 * `aspectRatio` — the container's shape. Wider-than-tall values crop out
 *   the empty region above/below the art.
 * `objectPosition` — which slice of the image is anchored inside that
 *   container. Combined with `object-fit: cover` the image scales to fill
 *   the container's width and the extra height overflows in the direction
 *   opposite the anchor.
 *
 * Values are conservative defaults picked to match the 200×350 art —
 * tweak here if the artist re-crops the canvas. All boxes in the Builder
 * (active section stack, peer-revealed section image, placeholder
 * silhouette) use the same values so the column reads as one figure.
 */
export interface SectionCrop {
  marginTop?: string;
  height: string;
  objectPosition: string;
  parts?: {
    headShape?: { marginTop?: string; height?: string };
    nose?: { marginTop?: string; height?: string };
    eyes?: { marginTop?: string; height?: string };
    mouth?: { marginTop?: string; height?: string };
    hair?: { marginTop?: string; height?: string };
    arms?: { marginTop?: string; height?: string };
    collar?: { marginTop?: string; height?: string };
    shirt?: { marginTop?: string; height?: string };
    torsoBack?: { marginTop?: string; height?: string };
    belt?: { marginTop?: string; height?: string };
    feet?: { marginTop?: string; height?: string };
    legs?: { marginTop?: string; height?: string };
    legsBack?: { marginTop?: string; height?: string };
    waist?: { marginTop?: string; height?: string };
  };
}

export const SECTION_CROP: Record<Section, SectionCrop> = {
  head: {
    marginTop: "-3px",
    height: "125px",
    objectPosition: "center top",
    parts: {
      headShape: { marginTop: "20px", height: "60px" },
      nose: { marginTop: "-5px", height: "50px" },
      eyes: { marginTop: "10px", height: "50px" },
      mouth: { marginTop: "5px", height: "50px" },
      hair: { marginTop: "55px", height: "70px" },
    },
  },
  torso: {
    marginTop: "-75px",
    height: "130px",
    objectPosition: "center 60%",
    parts: {
      arms: { marginTop: "-50px", height: "55px" },
      collar: { marginTop: "-35px", height: "65px" },
      shirt: { marginTop: "-40px", height: "60px" },
      torsoBack: { marginTop: "-35px", height: "90px" },
    },
  },
  legs: {
    marginTop: "-90px",
    height: "120px",
    objectPosition: "center bottom",
    parts: {
      belt: { marginTop: "-50px", height: "55px" },
      feet: { marginTop: "-95px", height: "70px" },
      legs: { marginTop: "-75px", height: "55px" },
      legsBack: { marginTop: "-45px", height: "80px" },
      waist: { marginTop: "-55px", height: "65px" },
    },
  },
};
