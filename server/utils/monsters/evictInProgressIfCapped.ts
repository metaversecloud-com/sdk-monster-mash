import { IN_PROGRESS_CAP } from "@shared/content/monsterMash.js";
import { KeyAssetDataObject, MonsterIndexEntry } from "@shared/types/index.js";

export interface EvictInProgressResult {
  monsters: KeyAssetDataObject["monsters"];
  changed: boolean;
  evictedIds: string[];
}

/**
 * Enforces `IN_PROGRESS_CAP` (spec §Create tab: max 100 in-progress).
 * Evicts the oldest by `lastEditedAt` (falls back to `createdAt`) — matches
 * spec's "eldest-first" rule. Doesn't touch `state: "complete"` entries.
 *
 * We reserve one slot for the caller who is about to `POST /monsters/start`,
 * so eviction runs down to `IN_PROGRESS_CAP - 1` when `reserveOne` is true.
 */
export const evictInProgressIfCapped = (
  monsters: KeyAssetDataObject["monsters"] | undefined,
  reserveOne: boolean = true,
): EvictInProgressResult => {
  const evictedIds: string[] = [];
  if (!monsters) return { monsters: {}, changed: false, evictedIds };

  const target = reserveOne ? IN_PROGRESS_CAP - 1 : IN_PROGRESS_CAP;
  const entries = Object.entries(monsters);
  const inProgress = entries.filter(([, e]) => e?.state === "in-progress");

  if (inProgress.length <= target) return { monsters, changed: false, evictedIds };

  inProgress.sort(([, a], [, b]) => {
    const aAge = (a as MonsterIndexEntry)?.lastEditedAt ?? (a as MonsterIndexEntry)?.createdAt ?? 0;
    const bAge = (b as MonsterIndexEntry)?.lastEditedAt ?? (b as MonsterIndexEntry)?.createdAt ?? 0;
    return aAge - bAge;
  });

  const evictCount = inProgress.length - target;
  for (let i = 0; i < evictCount; i++) {
    const [id] = inProgress[i];
    evictedIds.push(id);
  }

  const next: KeyAssetDataObject["monsters"] = {};
  const evictSet = new Set(evictedIds);
  for (const [id, entry] of entries) {
    if (evictSet.has(id)) continue;
    next[id] = entry;
  }

  return { monsters: next, changed: evictedIds.length > 0, evictedIds };
};
