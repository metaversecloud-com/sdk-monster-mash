import { DroppedAssetInterface } from "@rtsdk/topia";
import {
  MonsterAssetDataObject,
  MonsterMashVisitorData,
  Section,
  SECTIONS,
  SectionRecord,
  VisitorDataObjectType,
} from "@shared/types/index.js";
import { Credentials } from "../../types/index.js";
import { composeAndUploadMonster } from "../images/composeMonster.js";
import { User, World } from "../topiaInit.js";
import { composeMonsterName } from "./composeMonsterName.js";
import { deleteBrokenMonster } from "./deleteBrokenMonster.js";
import { invalidateKeyAssetCache } from "./keyAssetCache.js";

/**
 * Per-process attempt-dedup. Prevents concurrent `/main-app` opens on the
 * same pod from all firing a heal for the same broken monster. First claim
 * wins; others see "attempted within the window" and skip. 60s TTL covers
 * the longest realistic heal time (image compose + S3 upload + three
 * dataObject round-trips).
 */
const HEAL_ATTEMPT_TTL_MS = 60 * 1000;
const healAttempts = new Map<string, number>();

const claimHealAttempt = (monsterId: string): boolean => {
  const last = healAttempts.get(monsterId) ?? 0;
  if (Date.now() - last < HEAL_ATTEMPT_TTL_MS) return false;
  healAttempts.set(monsterId, Date.now());
  return true;
};

/**
 * Walk the already-fetched roster and find the first `state === "complete"`
 * entry whose `name` is empty — the symptom of a `finalizeMonster` run that
 * couldn't fetch one or more peers during the CloudFront incident. Returns
 * `undefined` when the roster is clean. Zero SDK cost.
 */
export const findBrokenMonsterId = (
  monsters: Record<string, { state?: string; name?: string } | undefined> | undefined,
): string | undefined => {
  if (!monsters) return undefined;
  for (const [monsterId, entry] of Object.entries(monsters)) {
    if (!entry || entry.state !== "complete") continue;
    if (!entry.name) return monsterId;
  }
  return undefined;
};

interface HealInput {
  credentials: Credentials;
  keyAsset: DroppedAssetInterface;
  monsterId: string;
}

/**
 * Rebuild a monster whose `finalizeMonster` run compose'd empty picks /
 * nameToken for one or more sections (seen in production as an "Unnamed
 * Monster" with a half-rendered image). The caller's own picks were written
 * to the dropped-monster asset's dataObject BEFORE any peer fetch could
 * fail, and each peer who failed to load during finalize still has their
 * section's picks on their visitor `contributedDrafts[monsterId][section]`
 * — because the per-peer cleanup in finalize is gated on `if (!p.target)
 * continue`. So we can usually recover.
 *
 * Flow:
 *   1. Resolve the dropped-monster asset by its `uniqueName`.
 *   2. For each section, prefer the asset's stored `parts` + `nameToken`.
 *      For any section where either is empty, look up its contributor's
 *      visitor data and read `contributedDrafts[monsterId][section]`.
 *   3. If any section truly can't be recovered → bail. Leaves the monster
 *      as-is; admin can delete manually.
 *   4. Re-compose + re-upload to the SAME S3 key (deterministic path on
 *      interactivePublicKey + monsterId), so the stored `imageUrl` doesn't
 *      change — overwrite replaces the broken image at the same URL.
 *   5. Update the dropped-monster asset's dataObject (name + sections) and
 *      dot-path write `monsters.{id}.name` on the keyAsset.
 *
 * Fire-and-forget: callers do NOT await. Any failure logs a warning and
 * leaves the monster in its current state; the dedup window lets the next
 * `/main-app` try again after a minute.
 */
export const healBrokenMonster = async ({ credentials, keyAsset, monsterId }: HealInput): Promise<void> => {
  if (!claimHealAttempt(monsterId)) return;
  try {
    const { urlSlug, sceneDropId, interactivePublicKey } = credentials;

    // 1. Resolve the dropped-monster asset. If it's gone entirely, we can't
    // heal from here — the caller's picks only live on this asset. Scrub
    // the monster from the roster + vote state so it doesn't keep showing
    // up as "Unnamed Monster" in the gallery and taking up a pool slot.
    const world = World.create(urlSlug, { credentials });
    const matches = await world.fetchDroppedAssetsWithUniqueName({ uniqueName: `MonsterMash-monster-${monsterId}` });
    const monsterAsset = matches?.[0];
    if (!monsterAsset) {
      console.warn(`healBrokenMonster: dropped asset missing for ${monsterId} — unrecoverable, deleting`);
      await deleteBrokenMonster({ credentials, keyAsset, monsterId });
      return;
    }
    await monsterAsset.fetchDataObject();
    const assetData = (monsterAsset.dataObject || {}) as Partial<MonsterAssetDataObject>;
    const existingSections = (assetData.sections ?? {}) as Partial<Record<Section, SectionRecord>>;

    // 2. Collect picks + nameTokens per section, preferring the asset's own
    // record, falling back to each contributor's visitor data.
    const scopedKey = `${urlSlug}-${sceneDropId}`;
    const nextSections: Partial<Record<Section, SectionRecord>> = {};
    const picksBySection: Partial<Record<Section, { [categoryId: string]: string }>> = {};
    const nameTokensBySection: Partial<Record<Section, string>> = {};

    for (const s of SECTIONS) {
      const sec = existingSections[s];
      if (!sec?.contributorProfileId) {
        console.warn(`healBrokenMonster: no contributor on section ${s} for ${monsterId} — unrecoverable, deleting`);
        await deleteBrokenMonster({ credentials, keyAsset, monsterId, monsterAssetId: monsterAsset.id as string });
        return;
      }
      const assetHasPicks = sec.parts && Object.keys(sec.parts).length > 0;
      const assetHasNameToken = !!sec.nameToken && sec.nameToken.trim().length > 0;

      let picks = assetHasPicks ? sec.parts : undefined;
      let nameToken = assetHasNameToken ? sec.nameToken : undefined;

      if (!picks || !nameToken) {
        try {
          const peerUser = User.create({
            profileId: sec.contributorProfileId,
            credentials: { ...credentials, profileId: sec.contributorProfileId },
          });
          const raw = ((await peerUser.fetchDataObject()) || {}) as VisitorDataObjectType;
          const scoped = raw[scopedKey] as MonsterMashVisitorData | undefined;
          const draft = scoped?.contributedDrafts?.[monsterId]?.[s];
          if (!picks && draft?.picks) picks = draft.picks;
          if (!nameToken && draft?.nameToken) nameToken = draft.nameToken;
        } catch (error) {
          console.warn(`healBrokenMonster: failed to read peer ${sec.contributorProfileId} for ${monsterId}/${s}`, error);
        }
      }

      if (!picks || Object.keys(picks).length === 0 || !nameToken) {
        console.warn(`healBrokenMonster: ${monsterId}/${s} unrecoverable — deleting from roster`);
        await deleteBrokenMonster({ credentials, keyAsset, monsterId, monsterAssetId: monsterAsset.id as string });
        return;
      }

      picksBySection[s] = picks;
      nameTokensBySection[s] = nameToken;
      nextSections[s] = { ...sec, parts: picks, nameToken };
    }

    // 3. Re-compose. composeMonsterName returns "" if ANY nameToken missing,
    // but we've already guarded on that above.
    const composedName = composeMonsterName(nameTokensBySection);
    if (!composedName) {
      console.warn(`healBrokenMonster: composed name empty for ${monsterId} after recovery — unrecoverable, deleting`);
      await deleteBrokenMonster({ credentials, keyAsset, monsterId, monsterAssetId: monsterAsset.id as string });
      return;
    }

    // 4. Re-upload to the same S3 key (deterministic from interactivePublicKey
    // + monsterId). Overwrite replaces the broken image at the same URL;
    // the roster entry's `imageUrl` doesn't need to change.
    let newImageUrl: string;
    try {
      newImageUrl = await composeAndUploadMonster(monsterId, picksBySection, interactivePublicKey);
    } catch (error) {
      console.warn(`healBrokenMonster: compose/upload failed for ${monsterId}`, error);
      return;
    }

    // 5. Write the dropped-monster asset's dataObject with the full
    // sections map + composed name + fresh imageUrl. Then dot-path write
    // the keyAsset's roster entry's name (and imageUrl, in case it was
    // null before).
    try {
      await monsterAsset.updateDataObject(
        { sections: nextSections, name: composedName, imageUrl: newImageUrl },
        {
          lock: {
            lockId: `heal-${monsterId}-${Math.round(Date.now() / 60000) * 60000}`,
            releaseLock: true,
          },
        },
      );
    } catch (error) {
      console.warn(`healBrokenMonster: dropped-asset dataObject write failed for ${monsterId}`, error);
      // Keep going — the roster-entry name write below is the user-visible fix.
    }

    try {
      await keyAsset.updateDataObject(
        {
          [`monsters.${monsterId}.name`]: composedName,
          [`monsters.${monsterId}.imageUrl`]: newImageUrl,
        },
        {
          lock: {
            lockId: `heal-roster-${monsterId}-${Math.round(Date.now() / 60000) * 60000}`,
            releaseLock: true,
          },
        },
      );
      invalidateKeyAssetCache(urlSlug);
      console.log(`healBrokenMonster: healed ${monsterId} as "${composedName}"`);
    } catch (error) {
      console.warn(`healBrokenMonster: roster write failed for ${monsterId}`, error);
    }
  } catch (error) {
    console.warn(`healBrokenMonster: unexpected failure for ${monsterId}`, error);
  }
};

/** Test hook — not called in production. */
export const clearHealAttempts = (): void => {
  healAttempts.clear();
};
