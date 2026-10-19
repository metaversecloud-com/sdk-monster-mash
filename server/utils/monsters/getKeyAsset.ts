import { DroppedAssetInterface } from "@rtsdk/topia";
import { Credentials } from "../../types/index.js";
import { DroppedAsset } from "../topiaInit.js";
import { initializeKeyAsset } from "./initializeKeyAsset.js";
import { standardizeError } from "../standardizeError.js";

/**
 * The key asset's required uniqueName. Admins must drop the Monster Mash key
 * asset with this uniqueName set — it's documented for the admin install
 * flow but no longer used by the runtime, since `credentials.sceneDropId`
 * resolves to the same asset directly.
 */
export const KEY_ASSET_UNIQUE_NAME = "MonsterMash_keyAsset";

/**
 * Fetch the Monster Mash key asset and ensure its dataObject is initialized.
 * Every controller that reads roster / cycle / window state starts here.
 *
 * The key asset IS the scene instance: `credentials.sceneDropId` is its
 * dropped-asset id, so we resolve to it in one SDK call regardless of which
 * asset the caller actually clicked. This cuts the previous resolution
 * ladder (clicked-asset fetch + uniqueName check + world lookup fallback)
 * down to a single `DroppedAsset.get` + `fetchDataObject`. The clicked
 * asset's id (`credentials.assetId`) is NOT read here any more — the
 * CloudFront 403 under load was almost entirely this one extra read per
 * request × every controller × every student. The fallback to `assetId`
 * covers the never-should-happen case of a credentials shape without
 * `sceneDropId` (older client, direct URL hit without a scene context).
 */
export const getKeyAsset = async (credentials: Credentials): Promise<DroppedAssetInterface> => {
  try {
    const { assetId, sceneDropId, urlSlug } = credentials;
    const keyAssetId = sceneDropId || assetId;

    const keyAsset = await DroppedAsset.get(keyAssetId, urlSlug, {
      credentials: { ...credentials, assetId: keyAssetId },
    });
    if (!keyAsset) throw new Error("Monster Mash: key asset not found");

    await keyAsset.fetchDataObject();
    await initializeKeyAsset(keyAsset);
    return keyAsset;
  } catch (error) {
    throw standardizeError(error);
  }
};
