import { DroppedAssetInterface } from "@rtsdk/topia";
import { KeyAssetDataObject } from "@shared/types/index.js";
import { Credentials } from "../../types/index.js";
import { DroppedAsset, World } from "../topiaInit.js";
import { initializeKeyAsset } from "./initializeKeyAsset.js";
import { getCachedKeyAssetData, setCachedKeyAssetData } from "./keyAssetCache.js";
import { standardizeError } from "../standardizeError.js";

/**
 * The key asset's required uniqueName. Admins must drop the Monster Mash key
 * asset with this uniqueName set — it's how every controller finds the right
 * dataObject regardless of which asset the caller clicked (Trophy drawer,
 * monster drawer, Info sign, etc.).
 */
export const KEY_ASSET_UNIQUE_NAME = "MonsterMash_keyAsset";

/**
 * Fetch the Monster Mash key asset and ensure its dataObject is initialized.
 * Every controller that reads roster / cycle / window state starts here.
 *
 * `credentials.sceneDropId` identifies the SCENE instance, not the key asset
 * — the key asset is a specific dropped asset INSIDE that scene with its own
 * id, which the clicked-asset fetch + uniqueName match (or the world-level
 * `fetchDroppedAssetsWithUniqueName` fallback) is what actually resolves.
 *
 * Resolution ladder:
 *   1. If the clicked asset's `uniqueName` is `MonsterMash_keyAsset`, that
 *      asset IS the key asset — fast path, no extra lookup.
 *   2. Otherwise look up the key asset by its uniqueName in the world. The
 *      SDK returns an array; we take the first match. If none, throw a
 *      clear error so the admin knows the key asset isn't set up right.
 */
export const getKeyAsset = async (credentials: Credentials): Promise<DroppedAssetInterface> => {
  try {
    const { assetId, urlSlug } = credentials;

    // Fast path: short-TTL cache. If a prior request in the last few seconds
    // already resolved the key asset + fetched its dataObject, build a fresh
    // controller against the cached id (SYNC — `DroppedAsset.create` doesn't
    // hit the network) and seed `.dataObject` from the cache. Zero SDK calls
    // on cache hit. Every keyAsset write path invalidates (see
    // `invalidateKeyAssetCache` call sites) so cross-request writes are
    // visible on the next read.
    const cached = getCachedKeyAssetData(urlSlug);
    if (cached) {
      const keyAsset = DroppedAsset.create(cached.keyAssetId, urlSlug, {
        credentials: { ...credentials, assetId: cached.keyAssetId },
      }) as DroppedAssetInterface;
      (keyAsset as { dataObject: KeyAssetDataObject }).dataObject = cached.dataObject;
      return keyAsset;
    }

    // Step 1 — resolve to the key asset: the caller clicked the key asset itself.
    const clickedAsset = await DroppedAsset.get(assetId, urlSlug, { credentials });
    if (!clickedAsset) throw new Error("Monster Mash: asset not found");
    const clickedUniqueName = (clickedAsset as unknown as { uniqueName?: string }).uniqueName ?? "";
    if (clickedUniqueName === KEY_ASSET_UNIQUE_NAME) {
      await clickedAsset.fetchDataObject();
      await initializeKeyAsset(clickedAsset);
      setCachedKeyAssetData(urlSlug, clickedAsset.id as string, clickedAsset.dataObject as KeyAssetDataObject);
      return clickedAsset;
    }

    // Step 2 — caller clicked something else (Trophy, monster, Info sign).
    // Resolve the real key asset by its known uniqueName.
    const world = World.create(urlSlug, { credentials });
    const matches = await world.fetchDroppedAssetsWithUniqueName({ uniqueName: KEY_ASSET_UNIQUE_NAME });
    if (!matches || matches.length === 0) {
      throw new Error(
        `Monster Mash: no dropped asset with uniqueName="${KEY_ASSET_UNIQUE_NAME}" in this world. ` +
          `Admin must set that uniqueName on the Monster Mash key asset.`,
      );
    }
    const keyAsset = matches[0];
    await keyAsset.fetchDataObject();
    await initializeKeyAsset(keyAsset);
    setCachedKeyAssetData(urlSlug, keyAsset.id as string, keyAsset.dataObject as KeyAssetDataObject);
    return keyAsset;
  } catch (error) {
    throw standardizeError(error);
  }
};
