import { AwardRibbon, KeyAssetDataObject } from "@shared/types/index.js";

/**
 * Pull the ribbon fields for one monster from the keyed storedWinners map.
 * Returns undefined when the monster has never won. The shape matches
 * `AwardRibbon` so it can be stuffed straight into Gallery / Single
 * Monster payloads.
 */
export const getRibbonFromStoredWinners = (
  storedWinners: KeyAssetDataObject["storedWinners"] | undefined,
  monsterId: string,
): AwardRibbon | undefined => {
  const entry = storedWinners?.[monsterId];
  if (!entry) return undefined;
  return { category: entry.category, place: entry.place, awardedAt: entry.awardedAt };
};
