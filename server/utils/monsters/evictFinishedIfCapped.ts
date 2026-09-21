import { FINISHED_CAP } from "@shared/content/monsterMash.js";
import { KeyAssetDataObject, MonsterIndexEntry } from "@shared/types/index.js";

export interface EvictFinishedResult {
  monsters: KeyAssetDataObject["monsters"];
  changed: boolean;
  evictedIds: string[];
}

/**
 * Enforces `FINISHED_CAP` on the roster's completed entries. Eviction is
 * caller-oblivious — pure eldest by `lastEditedAt`. The "your own monsters
 * are never dropped from the gallery" carve-out is enforced on the CALLER
 * side by enriching each contributor's `visitorData.contributedMonsters`
 * with monster metadata at finalize time; evicted own-monsters still surface
 * in the caller's "mine" filter.
 *
 * The corresponding dropped asset in the world is left alone — eviction is
 * only a roster / display-cap concern.
 */
export const evictFinishedIfCapped = (
  monsters: KeyAssetDataObject["monsters"] | undefined,
): EvictFinishedResult => {
  const evictedIds: string[] = [];
  if (!monsters) return { monsters: {}, changed: false, evictedIds };

  const entries = Object.entries(monsters);
  const finished = entries.filter(([, e]) => e?.state === "complete");
  if (finished.length <= FINISHED_CAP) return { monsters, changed: false, evictedIds };

  finished.sort(([, a], [, b]) => {
    const aAge = (a as MonsterIndexEntry)?.lastEditedAt ?? (a as MonsterIndexEntry)?.createdAt ?? 0;
    const bAge = (b as MonsterIndexEntry)?.lastEditedAt ?? (b as MonsterIndexEntry)?.createdAt ?? 0;
    return aAge - bAge;
  });

  const evictCount = finished.length - FINISHED_CAP;
  for (let i = 0; i < evictCount; i++) evictedIds.push(finished[i][0]);

  const evictSet = new Set(evictedIds);
  const next: KeyAssetDataObject["monsters"] = {};
  for (const [id, entry] of entries) {
    if (evictSet.has(id)) continue;
    next[id] = entry;
  }
  return { monsters: next, changed: evictedIds.length > 0, evictedIds };
};
