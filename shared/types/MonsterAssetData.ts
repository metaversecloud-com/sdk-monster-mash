import { AwardRibbon, Section } from "./SharedTypes.js";

export interface SectionRecord {
  contributorProfileId: string;
  contributorDisplayName: string;
  submittedAt: number;
  /** { headShape: "jack-o-lantern", eyes: "googly", ... } — maps to LAYER_ORDER slots. */
  parts: { [categoryId: string]: string };
  /** first-name (head) | last-name (torso) | title (legs). */
  nameToken: string;
}

/**
 * Root shape for a per-monster dropped-asset dataObject. One of these exists
 * per finished monster (dropped in the world at completion). In-progress
 * monsters have no dropped asset — their picks live on each contributor's
 * visitor dataObject (`contributedDrafts`) and migrate here only when the
 * third section lands.
 */
export interface MonsterAssetDataObject {
  schemaVersion: 1;
  monsterId: string;
  name: string;
  birthdate: number;
  imageUrl: string;
  /** [head, torso, legs] contributor profileIds. */
  contributorProfileIds: [string, string, string];
  /** [head, torso, legs] contributor display names. */
  contributorDisplayNames: [string, string, string];
  sections: Record<Section, SectionRecord>;
  /** Denormalized ribbon for the Single Monster View drawer. */
  latestAward?: AwardRibbon;
}
