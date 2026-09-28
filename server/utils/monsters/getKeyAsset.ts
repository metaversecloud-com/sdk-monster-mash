import { DroppedAssetInterface } from "@rtsdk/topia";
import { Credentials } from "../../types/index.js";
import { DroppedAsset, World } from "../topiaInit.js";
import { initializeKeyAsset } from "./initializeKeyAsset.js";
import { standardizeError } from "../standardizeError.js";

/**
 * Heuristic: does this dataObject look like the KEY asset's shape (holds
 * the roster + submission window) rather than a monster's shape? The key
 * asset's initializer stamps `schemaVersion: 1` alongside a `monsters` map
 * and `currentSubmissionWindow`; a monster's dataObject also has
 * `schemaVersion: 1` but with `monsterId` + `sections` + no `monsters`.
 * Checking for `monsters` OR `currentSubmissionWindow` is enough to
 * disambiguate without relying on the un-initialized `schemaVersion`
 * defaulting to undefined.
 */
const looksLikeKeyAsset = (dataObject: unknown): boolean => {
  if (!dataObject || typeof dataObject !== "object") return false;
  const d = dataObject as Record<string, unknown>;
  return "monsters" in d || "currentSubmissionWindow" in d;
};

const MONSTER_UNIQUE_NAME_PREFIX = "MonsterMash-monster-";

/**
 * Fetch the Monster Mash key asset and ensure its dataObject is initialized.
 * Every controller that reads roster / cycle / window state starts here.
 *
 * `credentials.assetId` normally points at the key asset itself — that's
 * the asset the caller clicked to open the main-app modal. But when a
 * player opens a monster's drawer by clicking the monster's dropped asset
 * in the world, `credentials.assetId` is the MONSTER's id, not the key
 * asset's. In that flow, admin actions (Delete monster) still need to
 * mutate the key asset's roster.
 *
 * Resolution ladder:
 *   1. Fetch the asset at `credentials.assetId`. If its dataObject already
 *      looks like a key asset, return it.
 *   2. Otherwise, if the dataObject carries `keyAssetId` (monsters dropped
 *      via `dropMonsterAsset` after this shim landed), follow the pointer.
 *   3. Fall back to a scene-wide `fetchDroppedAssetsBySceneDropId` scan —
 *      skip anything matching the monster uniqueName pattern, fetch each
 *      candidate's dataObject, and return the first one that looks like
 *      the key asset. This handles legacy monsters dropped BEFORE
 *      `keyAssetId` was persisted on the asset dataObject.
 */
export const getKeyAsset = async (credentials: Credentials): Promise<DroppedAssetInterface> => {
  try {
    const { assetId, sceneDropId, urlSlug } = credentials;

    // Step 1 — try the asset the caller clicked.
    const clickedAsset = await DroppedAsset.get(assetId, urlSlug, { credentials });
    if (!clickedAsset) throw new Error("Monster Mash: asset not found");
    await clickedAsset.fetchDataObject();
    if (looksLikeKeyAsset(clickedAsset.dataObject)) {
      await initializeKeyAsset(clickedAsset);
      return clickedAsset;
    }

    // Step 2 — the clicked asset is a monster (or something else). Prefer
    // the explicit backpointer.
    const pointerKeyAssetId = (clickedAsset.dataObject as { keyAssetId?: string } | null)?.keyAssetId;
    if (pointerKeyAssetId && pointerKeyAssetId !== assetId) {
      const viaPointer = await DroppedAsset.get(pointerKeyAssetId, urlSlug, { credentials });
      if (viaPointer) {
        await initializeKeyAsset(viaPointer);
        return viaPointer;
      }
    }

    // Step 3 — no backpointer (legacy monster, or something else clicked).
    // Sweep the scene for the key asset. Filter out obvious monsters by
    // uniqueName prefix so we don't fetch the world of drops.
    if (!sceneDropId) throw new Error("Monster Mash: cannot resolve key asset without a sceneDropId");
    const world = World.create(urlSlug, { credentials });
    const sceneAssets = await world.fetchDroppedAssetsBySceneDropId({ sceneDropId });
    const nonMonsterCandidates = (sceneAssets ?? []).filter((a) => {
      const uniqueName = (a as unknown as { uniqueName?: string }).uniqueName ?? "";
      return !uniqueName.startsWith(MONSTER_UNIQUE_NAME_PREFIX) && a.id !== assetId;
    });
    for (const candidate of nonMonsterCandidates) {
      try {
        await candidate.fetchDataObject();
        if (looksLikeKeyAsset(candidate.dataObject)) {
          await initializeKeyAsset(candidate);
          return candidate;
        }
      } catch (error) {
        console.warn(`getKeyAsset: could not read dataObject for candidate ${candidate.id}`, error);
      }
    }

    throw new Error("Monster Mash: key asset not found in scene");
  } catch (error) {
    throw standardizeError(error);
  }
};
