import { SECTION_LOCK_TTL_MS } from "@shared/content/monsterMash.js";
import { KeyAssetDataObject, SECTIONS } from "@shared/types/index.js";

export interface OrphanSweepResult {
  monsters: KeyAssetDataObject["monsters"];
  changed: boolean;
  evictedIds: string[];
}

/**
 * Reap orphan in-progress monsters — rows nobody is working on and nobody
 * has submitted to, left behind when a starter abandoned (or the server
 * crashed between create and claim). Keeps the roster lean so the Create
 * tab doesn't fill up with ghosts.
 *
 * An entry qualifies as an orphan when ALL of these are true:
 *   - `state === "in-progress"`
 *   - `contributorProfileIds` is empty (nobody has submitted a section)
 *   - every slot is `status: "available"` (no live lock, no submitted work)
 *   - the entry hasn't been touched (`lastEditedAt`, falling back to
 *     `createdAt`) within `SECTION_LOCK_TTL_MS` — the grace matches the
 *     section-lock TTL so a freshly-started monster whose lock is still
 *     counting down never gets nuked.
 *
 * This util is PURE and runs after `expireStaleLocks` so any locks that
 * aged out mid-request are already reflected in the slot statuses.
 */
export const evictOrphanInProgressMonsters = (
  monsters: KeyAssetDataObject["monsters"] | undefined,
  now: number = Date.now(),
): OrphanSweepResult => {
  const evictedIds: string[] = [];
  if (!monsters) return { monsters: {}, changed: false, evictedIds };

  const cutoff = now - SECTION_LOCK_TTL_MS;

  for (const [id, entry] of Object.entries(monsters)) {
    if (!entry || entry.state !== "in-progress") continue;
    if ((entry.contributorProfileIds ?? []).length > 0) continue;
    const sections = entry.sections;
    if (!sections) continue;
    const allAvailable = SECTIONS.every((s) => sections[s]?.status === "available");
    if (!allAvailable) continue;
    const anchor = entry.lastEditedAt ?? entry.createdAt ?? 0;
    if (anchor > cutoff) continue; // still within grace — skip.
    evictedIds.push(id);
  }

  if (evictedIds.length === 0) return { monsters, changed: false, evictedIds };

  const evictSet = new Set(evictedIds);
  const next: KeyAssetDataObject["monsters"] = {};
  for (const [id, entry] of Object.entries(monsters)) {
    if (evictSet.has(id)) continue;
    next[id] = entry;
  }
  return { monsters: next, changed: true, evictedIds };
};
