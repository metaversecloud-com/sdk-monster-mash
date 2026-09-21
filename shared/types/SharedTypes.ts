/**
 * Shared primitives used across every Monster Mash data-object shape.
 *
 * Keep this file thin — actual dataObject shapes live in their own files
 * (KeyAssetData.ts, MonsterAssetData.ts, TrophyData.ts, VisitorData.ts) and
 * re-export the shared bits from here.
 */

export type Section = "head" | "torso" | "legs";

export const SECTIONS: readonly Section[] = ["head", "torso", "legs"] as const;

export type SectionStatus = "available" | "locked" | "done";

export type Place = 1 | 2 | 3;

export interface AwardRibbon {
  category: string;
  place: Place;
  awardedAt: number;
}

export interface Contributor {
  profileId: string;
  displayName: string;
}
