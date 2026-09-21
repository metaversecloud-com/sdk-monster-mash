import { SECTION_LOCK_TTL_MS } from "@shared/content/monsterMash.js";
import { KeyAssetDataObject, MonsterIndexEntry, Section, SECTIONS } from "@shared/types/index.js";

export interface StaleLockExpiryResult {
  monsters: KeyAssetDataObject["monsters"];
  changed: boolean;
  releasedClaims: Array<{ monsterId: string; section: Section; contributorProfileId?: string }>;
}

/**
 * Opportunistic — called on every read that surfaces roster state.
 * Any section that is `locked` past the TTL flips back to `available`; the
 * caller's `activeDraft` (on the visitor dataObject) is a separate concern.
 *
 * Returns a NEW `monsters` map. Left alone (no changed=false) means nothing
 * was flipped, so the caller can skip the write.
 */
export const expireStaleLocks = (
  monsters: KeyAssetDataObject["monsters"] | undefined,
  now: number = Date.now(),
): StaleLockExpiryResult => {
  const cutoff = now - SECTION_LOCK_TTL_MS;
  const released: StaleLockExpiryResult["releasedClaims"] = [];
  if (!monsters) return { monsters: {}, changed: false, releasedClaims: released };

  let changed = false;
  const next: KeyAssetDataObject["monsters"] = {};

  for (const [id, entry] of Object.entries(monsters)) {
    if (!entry || entry.state === "complete") {
      next[id] = entry;
      continue;
    }
    const nextEntry: MonsterIndexEntry = { ...entry, sections: { ...entry.sections } };
    let entryChanged = false;
    for (const section of SECTIONS) {
      const slot = nextEntry.sections[section];
      if (!slot || slot.status !== "locked") continue;
      const anchor = slot.lockedAt ?? slot.submittedAt ?? 0;
      if (anchor < cutoff) {
        released.push({
          monsterId: id,
          section,
          contributorProfileId: slot.contributorProfileId,
        });
        nextEntry.sections[section] = { status: "available" };
        entryChanged = true;
      }
    }
    next[id] = entryChanged ? nextEntry : entry;
    if (entryChanged) changed = true;
  }

  return { monsters: next, changed, releasedClaims: released };
};
