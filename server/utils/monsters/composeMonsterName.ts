import { Section } from "@shared/types/index.js";

/**
 * Compose a monster's storable name from the three name tokens. Called when
 * the third section is submitted.
 *   head:  first name  (Harold)
 *   torso: last name   (McFishy)
 *   legs:  title       (the Magnificent)
 * → "Harold McFishy the Magnificent"
 *
 * Returns an empty string when a token is missing (should never happen once
 * all three sections are done, but we defend).
 */
export const composeMonsterName = (nameTokens: Partial<Record<Section, string>>): string => {
  const head = nameTokens.head?.trim() ?? "";
  const torso = nameTokens.torso?.trim() ?? "";
  const legs = nameTokens.legs?.trim() ?? "";
  if (!head || !torso || !legs) return "";
  return `${head} ${torso} ${legs}`;
};
