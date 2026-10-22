import { DroppedAssetInterface } from "@rtsdk/topia";
import { KeyAssetDataObject } from "@shared/types/index.js";
import { Credentials } from "../../types/index.js";
import { World } from "../topiaInit.js";
import { invalidateKeyAssetCache } from "./keyAssetCache.js";

/**
 * Scrub a monster that is unrecoverable (heal couldn't recover its picks,
 * or finalize retry has exhausted its attempt budget) from every piece of
 * key-asset state + delete the in-world dropped asset if one exists.
 *
 * Uses full-object replacement for every map we touch (matches
 * `handleDeleteMonster`'s pattern) rather than dot-path writes with
 * `null` — the SDK persists dot-path `null` values as literal `null`
 * entries in the parent map, which blow up downstream readers like
 * `collectLastWinners` that assume every map value is non-null.
 *
 * Writes done in a SINGLE `keyAsset.updateDataObject` call per the
 * "one write per controller per dataObject" rule, covering:
 *   - `monsters` — rewritten without `{id}`
 *   - `currentSubmissionWindow.eligibleMonsterIds` — `{id}` filtered out
 *   - `currentVoteCycle.poolMonsterIds` + `tallies` — `{id}` removed
 *   - `storedWinners` — rewritten without `{id}` IF it was present (a
 *     crowned-and-later-broken monster shouldn't surface in Last Week's
 *     Winners; brand-new broken monsters that were never crowned skip
 *     this field)
 *
 * Then cache invalidation + a best-effort world-asset delete. All failures
 * are non-fatal — the caller fire-and-forgets.
 *
 * Does NOT delete the S3 image. Images are keyed on `monsterId`; the ID
 * never recycles, so a lingering image on S3 is dead weight only. If we
 * decide later to GC them it should be a bulk cleanup job, not a hot-path
 * side effect.
 */
export const deleteBrokenMonster = async ({
  credentials,
  keyAsset,
  monsterId,
  monsterAssetId,
}: {
  credentials: Credentials;
  keyAsset: DroppedAssetInterface;
  monsterId: string;
  /** When known, saves a lookup. Falls back to reading the roster entry. */
  monsterAssetId?: string;
}): Promise<void> => {
  try {
    const dataObject = (keyAsset.dataObject || {}) as KeyAssetDataObject;
    const rosterEntry = dataObject.monsters?.[monsterId];
    const resolvedAssetId = monsterAssetId ?? rosterEntry?.monsterAssetId;

    const nextMonsters = { ...(dataObject.monsters ?? {}) };
    delete nextMonsters[monsterId];
    const patch: Record<string, unknown> = { monsters: nextMonsters };

    const window = dataObject.currentSubmissionWindow;
    if (window?.eligibleMonsterIds?.includes(monsterId)) {
      patch.currentSubmissionWindow = {
        ...window,
        eligibleMonsterIds: window.eligibleMonsterIds.filter((id) => id !== monsterId),
      };
    }

    const cycle = dataObject.currentVoteCycle;
    if (cycle) {
      const poolHasId = cycle.poolMonsterIds?.includes(monsterId);
      const talliesHasId = !!cycle.tallies?.[monsterId];
      if (poolHasId || talliesHasId) {
        const nextTallies = { ...(cycle.tallies ?? {}) };
        delete nextTallies[monsterId];
        patch.currentVoteCycle = {
          ...cycle,
          poolMonsterIds: (cycle.poolMonsterIds ?? []).filter((id) => id !== monsterId),
          tallies: nextTallies,
        };
      }
    }

    if (dataObject.storedWinners?.[monsterId]) {
      const nextStored = { ...dataObject.storedWinners };
      delete nextStored[monsterId];
      patch.storedWinners = nextStored;
    }

    await keyAsset.updateDataObject(patch, {
      lock: {
        lockId: `delete-broken-${monsterId}-${Math.round(Date.now() / 60000) * 60000}`,
        releaseLock: true,
      },
      analytics: [
        {
          analyticName: "monster_deleted_broken",
          profileId: credentials.profileId,
          urlSlug: credentials.urlSlug,
        },
      ],
    });
    invalidateKeyAssetCache(credentials.urlSlug);

    if (resolvedAssetId) {
      try {
        await World.deleteDroppedAssets(
          credentials.urlSlug,
          [resolvedAssetId],
          process.env.INTERACTIVE_SECRET || "",
          credentials,
        );
      } catch (error) {
        // Already-deleted / 404 is fine; a lingering ghost asset in-world
        // is cosmetic and the admin tools can mop it up.
        console.warn(`deleteBrokenMonster: non-fatal world-asset delete failed for ${monsterId}`, error);
      }
    }

    const winnerContext = dataObject.storedWinners?.[monsterId]
      ? ` (was winner: ${dataObject.storedWinners[monsterId].category} place ${dataObject.storedWinners[monsterId].place})`
      : "";
    console.log(
      `deleteBrokenMonster: scrubbed ${monsterId} from roster + vote state${winnerContext} (triggered by profileId=${credentials.profileId})`,
    );
  } catch (error) {
    console.warn(`deleteBrokenMonster: unexpected failure for ${monsterId}`, error);
  }
};
