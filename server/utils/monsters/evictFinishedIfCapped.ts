import { FINISHED_CAP } from "@shared/content/monsterMash.js";
import { KeyAssetDataObject, MonsterIndexEntry } from "@shared/types/index.js";

export interface EvictFinishedResult {
  monsters: KeyAssetDataObject["monsters"];
  changed: boolean;
  evictedIds: string[];
}

export interface EvictFinishedOptions {
  /**
   * `storedWinners` map from the keyAsset. Any id present in it is a
   * crowned winner and is NEVER evicted, period — winners always show
   * up in the gallery, even if that pushes the roster above
   * `FINISHED_CAP`. We prefer letting the roster grow a bit over
   * silently retiring winning monsters from the UI.
   */
  storedWinners?: KeyAssetDataObject["storedWinners"];
}

/**
 * Enforces `FINISHED_CAP` on the roster's non-winner completed entries.
 *
 * Eviction order: eldest-first by `birthdate` (completion timestamp)
 * among non-winners. **Winners are never evicted.** The non-winner cap
 * is still `FINISHED_CAP`, so the roster's total size will drift above
 * that cap as crownings accumulate — intentional, since the only cost
 * is modest keyAsset dataObject growth and the win is that no admin
 * ever has to explain why a winning monster vanished from the Last
 * Week's Winners column.
 *
 * The "your own monsters are never dropped from the gallery" carve-out
 * is enforced on the CALLER side by enriching each contributor's
 * `visitorData.contributedMonsters` at finalize time.
 *
 * Pure — this helper only computes the shrunken roster map; the
 * matching world-drop deletion is handled by the caller.
 */
export const evictFinishedIfCapped = (
  monsters: KeyAssetDataObject["monsters"] | undefined,
  options: EvictFinishedOptions = {},
): EvictFinishedResult => {
  const evictedIds: string[] = [];
  if (!monsters) return { monsters: {}, changed: false, evictedIds };

  const entries = Object.entries(monsters);
  const finished = entries.filter(([, e]) => e?.state === "complete");

  const storedWinners = options.storedWinners ?? {};
  const isWinner = (id: string): boolean => !!storedWinners[id];

  // Only non-winners count toward the cap and only non-winners are
  // eligible for eviction. Winners stay on the roster forever.
  const evictable = finished.filter(([id]) => !isWinner(id));
  if (evictable.length <= FINISHED_CAP) {
    return { monsters, changed: false, evictedIds };
  }

  evictable.sort(([, a], [, b]) => {
    const aAge = (a as MonsterIndexEntry)?.birthdate ?? 0;
    const bAge = (b as MonsterIndexEntry)?.birthdate ?? 0;
    return aAge - bAge;
  });

  const evictCount = evictable.length - FINISHED_CAP;
  for (let i = 0; i < evictCount; i++) evictedIds.push(evictable[i][0]);

  const evictSet = new Set(evictedIds);
  const next: KeyAssetDataObject["monsters"] = {};
  for (const [id, entry] of entries) {
    if (evictSet.has(id)) continue;
    next[id] = entry;
  }

  // Structured per-eviction log so attribution questions ("why is this
  // monster showing as deleted?") can be answered by grepping prod logs.
  for (const id of evictedIds) {
    console.log(`evictFinishedIfCapped: evicted ${id} (non-winner cap=${FINISHED_CAP})`);
  }

  return { monsters: next, changed: evictedIds.length > 0, evictedIds };
};
