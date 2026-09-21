import { MonsterIndexEntry } from "@shared/types/index.js";

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
export const composeMonsterName = (entry: MonsterIndexEntry): string => {
  const head = entry.inProgressSections?.head?.nameToken?.trim() ?? "";
  const torso = entry.inProgressSections?.torso?.nameToken?.trim() ?? "";
  const legs = entry.inProgressSections?.legs?.nameToken?.trim() ?? "";
  if (!head || !torso || !legs) return "";
  return `${head} ${torso} ${legs}`;
};
