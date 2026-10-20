import { DroppedAssetInterface, UserInterface, VisitorInterface } from "@rtsdk/topia";
import {
  KeyAssetDataObject,
  MonsterAssetDataObject,
  MonsterIndexEntry,
  MonsterMashVisitorData,
  Section,
  SECTIONS,
  SectionRecord,
  VisitorDataObjectType,
} from "@shared/types/index.js";
import { Credentials } from "../../types/index.js";
import { composeAndUploadMonster } from "../images/composeMonster.js";
import { createEmptyVisitorData } from "../getVisitor.js";
import { User } from "../topiaInit.js";
import { composeMonsterName } from "./composeMonsterName.js";
import { deleteBrokenMonster } from "./deleteBrokenMonster.js";
import { dropMonsterAsset } from "./dropMonsterAsset.js";
import { invalidateKeyAssetCache } from "./keyAssetCache.js";

/**
 * Max retries before auto-delete. Counts the INITIAL finalize attempt in
 * `handleSubmitSection` as attempt 1, so this leaves 2 opportunistic retry
 * attempts (3 total) before giving up. The dead-data cost of a stuck
 * monster is low but non-zero — admins shouldn't have to clean these up,
 * and three attempts is enough to recover from transient SDK/network
 * blips without thrashing on data that's truly gone.
 */
const MAX_FINALIZE_ATTEMPTS = 3;
const RETRY_COOLDOWN_MS = 2 * 60 * 1000;

/**
 * Per-process attempt-dedup so concurrent `/main-app` opens on the same
 * pod don't all fire a retry for the same stuck monster.
 */
const retryAttempts = new Map<string, number>();
const claimRetryAttempt = (monsterId: string): boolean => {
  const last = retryAttempts.get(monsterId) ?? 0;
  if (Date.now() - last < RETRY_COOLDOWN_MS) return false;
  retryAttempts.set(monsterId, Date.now());
  return true;
};

/**
 * Walk the already-fetched roster for a monster that's state=in-progress
 * but has all three sections done — the signature of a finalize failure
 * in `handleSubmitSection`. Respects `lastFinalizeAttemptAt` so the sweep
 * doesn't thrash: if the last attempt was within the cooldown, skip and
 * try again next request.
 */
export const findStuckFinalizeId = (
  monsters: KeyAssetDataObject["monsters"] | undefined,
): string | undefined => {
  if (!monsters) return undefined;
  const now = Date.now();
  for (const [monsterId, entry] of Object.entries(monsters)) {
    if (!entry || entry.state !== "in-progress") continue;
    const allDone = SECTIONS.every((s) => entry.sections?.[s]?.status === "done");
    if (!allDone) continue;
    const lastAttemptAt = entry.lastFinalizeAttemptAt ?? 0;
    if (now - lastAttemptAt < RETRY_COOLDOWN_MS) continue;
    return monsterId;
  }
  return undefined;
};

interface RetryInput {
  credentials: Credentials;
  keyAsset: DroppedAssetInterface;
  monsterId: string;
  clickableLinkBase: string;
  callerVisitor: VisitorInterface | null;
}

interface SectionData {
  picks: { [categoryId: string]: string };
  nameToken: string;
  contributorProfileId: string;
  contributorDisplayName: string;
  submittedAt: number;
  rawUserData: VisitorDataObjectType;
  user: UserInterface | null;
}

/**
 * Retry a stuck finalize. Fire-and-forget — callers never await.
 *
 * Unlike `finalizeMonster` which runs inside `handleSubmitSection` and
 * reads the third submitter's picks from the HTTP request body, this one
 * runs opportunistically off `handleGetMainApp` with no HTTP caller.
 * Every section's picks are fetched from its contributor's visitor
 * `contributedDrafts` — `handleSubmitSection`'s finalize-failure path
 * now preserves the third submitter's drafts (previously deleted on
 * nowDone), so all three sections are readable.
 *
 * Attempt budget: if the attempt counter stamped on the roster entry has
 * reached `MAX_FINALIZE_ATTEMPTS` AND the sweep still can't recover full
 * section data, the monster is auto-deleted (roster entry removed, world
 * drop removed, vote state cleaned up). This keeps the gallery clean
 * without admin intervention.
 */
export const retryStuckFinalize = async ({
  credentials,
  keyAsset,
  monsterId,
  clickableLinkBase,
  callerVisitor,
}: RetryInput): Promise<void> => {
  if (!claimRetryAttempt(monsterId)) return;
  try {
    const dataObject = (keyAsset.dataObject || {}) as KeyAssetDataObject;
    const entry = dataObject.monsters?.[monsterId];
    if (!entry || entry.state !== "in-progress") return;

    const attempts = entry.finalizeAttempts ?? 0;
    const outOfRetries = attempts >= MAX_FINALIZE_ATTEMPTS;

    const { urlSlug, sceneDropId, interactivePublicKey } = credentials;
    const scopedKey = `${urlSlug}-${sceneDropId}`;

    // 1. Collect every section's data by fetching each contributor's
    // visitor dataObject.
    const sectionData: Partial<Record<Section, SectionData>> = {};
    let unrecoverable = false;
    for (const s of SECTIONS) {
      const slot = entry.sections?.[s];
      if (!slot?.contributorProfileId) {
        unrecoverable = true;
        break;
      }
      try {
        const user = (await User.create({
          profileId: slot.contributorProfileId,
          credentials: { ...credentials, profileId: slot.contributorProfileId },
        })) as UserInterface;
        const rawUserData = ((await user.fetchDataObject()) || {}) as VisitorDataObjectType;
        const scoped = rawUserData[scopedKey] as MonsterMashVisitorData | undefined;
        const draft = scoped?.contributedDrafts?.[monsterId]?.[s];
        if (!draft?.picks || Object.keys(draft.picks).length === 0 || !draft?.nameToken) {
          console.warn(
            `retryStuckFinalize: ${monsterId}/${s} missing drafts on contributor ${slot.contributorProfileId}`,
          );
          unrecoverable = true;
          break;
        }
        sectionData[s] = {
          picks: draft.picks,
          nameToken: draft.nameToken,
          contributorProfileId: slot.contributorProfileId,
          contributorDisplayName: slot.contributorDisplayName ?? "",
          submittedAt: slot.submittedAt ?? Date.now(),
          rawUserData,
          user,
        };
      } catch (error) {
        console.warn(`retryStuckFinalize: fetch failed for ${monsterId}/${s}`, error);
        // Transient fetch failure — don't mark unrecoverable yet, let
        // the attempt count climb and retry next sweep.
        await bumpAttempt(credentials, keyAsset, monsterId, attempts, outOfRetries);
        return;
      }
    }

    if (unrecoverable) {
      if (outOfRetries) {
        console.warn(`retryStuckFinalize: ${monsterId} exhausted retries + still missing data — deleting`);
        await deleteBrokenMonster({ credentials, keyAsset, monsterId });
      } else {
        await bumpAttempt(credentials, keyAsset, monsterId, attempts, false);
      }
      return;
    }

    // 2. Compose + upload.
    const picksBySection = {
      head: sectionData.head!.picks,
      torso: sectionData.torso!.picks,
      legs: sectionData.legs!.picks,
    };
    const nameTokensBySection = {
      head: sectionData.head!.nameToken,
      torso: sectionData.torso!.nameToken,
      legs: sectionData.legs!.nameToken,
    };
    const composedName = composeMonsterName(nameTokensBySection);
    if (!composedName) {
      console.warn(`retryStuckFinalize: composed name empty for ${monsterId} — unrecoverable`);
      await deleteBrokenMonster({ credentials, keyAsset, monsterId });
      return;
    }

    let imageUrl: string;
    try {
      imageUrl = await composeAndUploadMonster(monsterId, picksBySection, interactivePublicKey);
    } catch (error) {
      console.warn(`retryStuckFinalize: compose/upload failed for ${monsterId}`, error);
      await bumpAttempt(credentials, keyAsset, monsterId, attempts, outOfRetries);
      return;
    }

    // 3. Build section records + the final `MonsterAssetDataObject`.
    const birthdate = Date.now();
    const sectionRecords: Record<Section, SectionRecord> = {
      head: toSectionRecord(sectionData.head!),
      torso: toSectionRecord(sectionData.torso!),
      legs: toSectionRecord(sectionData.legs!),
    };
    const contributorProfileIds: [string, string, string] = [
      sectionData.head!.contributorProfileId,
      sectionData.torso!.contributorProfileId,
      sectionData.legs!.contributorProfileId,
    ];
    const contributorDisplayNames: [string, string, string] = [
      sectionData.head!.contributorDisplayName,
      sectionData.torso!.contributorDisplayName,
      sectionData.legs!.contributorDisplayName,
    ];
    const monsterAssetData: MonsterAssetDataObject = {
      schemaVersion: 1,
      monsterId,
      name: composedName,
      birthdate,
      imageUrl,
      contributorProfileIds,
      contributorDisplayNames,
      sections: sectionRecords,
    };

    // 4. Drop the in-world monster asset. Non-fatal — leaderboard etc.
    // key on monsterId, not assetId.
    let monsterAssetId: string | null = null;
    try {
      const droppedAsset = await dropMonsterAsset({
        credentials,
        visitor: callerVisitor,
        monsterId,
        imageUrl,
        clickableLinkBase,
        monsterAssetData,
      });
      monsterAssetId = droppedAsset.id as string;
    } catch (error) {
      console.warn(`retryStuckFinalize: dropMonsterAsset failed for ${monsterId}`, error);
    }

    // 5. Write the complete roster entry. Dot-path replace of the whole
    // monster record. Also clear the attempt bookkeeping fields.
    const completeEntry: MonsterIndexEntry = {
      monsterId,
      state: "complete",
      birthdate,
      name: composedName,
      contributorProfileIds,
      contributorNames: contributorDisplayNames.join("|"),
      ...(monsterAssetId ? { monsterAssetId } : {}),
      imageUrl,
    };
    try {
      await keyAsset.updateDataObject(
        { [`monsters.${monsterId}`]: completeEntry },
        {
          lock: {
            lockId: `retry-finalize-${monsterId}-${Math.round(Date.now() / 60000) * 60000}`,
            releaseLock: true,
          },
        },
      );
      invalidateKeyAssetCache(urlSlug);
    } catch (error) {
      console.warn(`retryStuckFinalize: keyAsset write failed for ${monsterId}`, error);
      await bumpAttempt(credentials, keyAsset, monsterId, attempts, outOfRetries);
      return;
    }

    // 6. Fan out all three contributors' visitor patches in parallel. Each
    // write merges the contributedMonsters enrichment, appends the
    // completion banner (dedup'd against prior appends for the same
    // monsterId so a retry doesn't double-stamp), and clears
    // contributedDrafts[monsterId].
    const enrichment: Partial<MonsterMashVisitorData["contributedMonsters"][string]> = {
      monsterAssetId: monsterAssetId ?? undefined,
      name: composedName,
      imageUrl,
      birthdate,
      contributorProfileIds,
      contributorDisplayNames,
    };
    const banner = { monsterId, monsterName: composedName, completedAt: birthdate };

    await Promise.all(
      SECTIONS.map(async (s) => {
        const sd = sectionData[s]!;
        if (!sd.user) return;
        try {
          const scoped =
            (sd.rawUserData[scopedKey] as MonsterMashVisitorData | undefined) ?? createEmptyVisitorData();
          const nextContribution = {
            ...(scoped.contributedMonsters?.[monsterId] ?? { section: s, submittedAt: sd.submittedAt }),
            ...enrichment,
            completedAt: birthdate,
          };
          const nextDrafts = { ...(scoped.contributedDrafts ?? {}) };
          delete nextDrafts[monsterId];
          const nextCompletion = [
            ...(scoped.pendingCompletionBanners ?? []).filter((b) => b.monsterId !== monsterId),
            banner,
          ];
          const nextScoped: MonsterMashVisitorData = {
            ...scoped,
            contributedMonsters: { ...(scoped.contributedMonsters ?? {}), [monsterId]: nextContribution },
            pendingCompletionBanners: nextCompletion,
            contributedDrafts: nextDrafts,
          };
          await sd.user.updateDataObject({ [scopedKey]: nextScoped }, {});
        } catch (error) {
          console.warn(`retryStuckFinalize: peer patch failed for ${monsterId}/${s}`, error);
        }
      }),
    );

    console.log(`retryStuckFinalize: completed ${monsterId} as "${composedName}" after ${attempts + 1} attempt(s)`);
  } catch (error) {
    console.warn(`retryStuckFinalize: unexpected failure for ${monsterId}`, error);
  }
};

const toSectionRecord = (sd: SectionData): SectionRecord => ({
  contributorProfileId: sd.contributorProfileId,
  contributorDisplayName: sd.contributorDisplayName,
  submittedAt: sd.submittedAt,
  parts: sd.picks,
  nameToken: sd.nameToken,
});

const bumpAttempt = async (
  credentials: Credentials,
  keyAsset: DroppedAssetInterface,
  monsterId: string,
  priorAttempts: number,
  outOfRetries: boolean,
): Promise<void> => {
  if (outOfRetries) {
    console.warn(`retryStuckFinalize: ${monsterId} exhausted retries — deleting`);
    await deleteBrokenMonster({ credentials, keyAsset, monsterId });
    return;
  }
  try {
    await keyAsset.updateDataObject(
      {
        [`monsters.${monsterId}.finalizeAttempts`]: priorAttempts + 1,
        [`monsters.${monsterId}.lastFinalizeAttemptAt`]: Date.now(),
      },
      {
        lock: {
          lockId: `retry-bump-${monsterId}-${Math.round(Date.now() / 60000) * 60000}`,
          releaseLock: true,
        },
      },
    );
    invalidateKeyAssetCache(credentials.urlSlug);
  } catch (error) {
    console.warn(`retryStuckFinalize: attempt-bump write failed for ${monsterId}`, error);
  }
};

/** Test hook — not called in production. */
export const clearRetryAttempts = (): void => {
  retryAttempts.clear();
};
