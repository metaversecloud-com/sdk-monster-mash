import { MonsterIndexEntry } from "@shared/types/index.js";

/**
 * Extract [head, torso, legs]-ordered contributor display names from a
 * roster entry.
 *
 * Complete monsters carry the names as a pipe-joined string
 * (`contributorNames = "Lina B|Dina|Integrations"`) — smaller than three
 * individually-quoted fields when multiplied by 200 finished entries per
 * app placement. In-progress monsters don't have that field yet; fall back
 * to the section state map, which still tracks per-slot identity while the
 * monster is being built.
 *
 * Empty-string slots (missing name) are filtered out of the output; the
 * callers use this for display-only strings ("Alice · Bob · Carol") where a
 * blank entry would render as a lonely bullet.
 */
export const contributorDisplayNamesFromEntry = (entry: MonsterIndexEntry): string[] => {
  if (entry.contributorNames) {
    return entry.contributorNames.split("|").filter(Boolean);
  }
  if (entry.sections) {
    const names: string[] = [];
    for (const s of ["head", "torso", "legs"] as const) {
      const n = entry.sections?.[s]?.contributorDisplayName;
      if (n) names.push(n);
    }
    return names;
  }
  return [];
};
