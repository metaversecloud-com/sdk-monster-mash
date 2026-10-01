import { DroppedAssetInterface } from "@rtsdk/topia";
import { Credentials } from "../../types/index.js";
import { DroppedAsset, World } from "../topiaInit.js";
import { initializeKeyAsset } from "./initializeKeyAsset.js";
import { standardizeError } from "../standardizeError.js";

/**
 * The key asset's required uniqueName. Admins must drop the Monster Mash key
 * asset with this uniqueName set — it's how every controller finds the right
 * dataObject regardless of which asset the caller clicked (Trophy drawer,
 * monster drawer, etc.).
 */
export const KEY_ASSET_UNIQUE_NAME = "MonsterMash_keyAsset";

/**
 * Fetch the Monster Mash key asset and ensure its dataObject is initialized.
 * Every controller that reads roster / cycle / window state starts here.
 *
 * `credentials.assetId` normally points at the asset the caller clicked —
 * which might be the key asset itself (main-app open), or a monster drawer,
 * or the Trophy drawer, etc. Only the KEY asset carries the roster /
 * leaderboard / cycle state, so we resolve to it explicitly by its known
 * uniqueName rather than guessing from dataObject shape.
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

    // Step 1 — fast path: the caller clicked the key asset itself.
    const clickedAsset = await DroppedAsset.get(assetId, urlSlug, { credentials });
    if (!clickedAsset) throw new Error("Monster Mash: asset not found");
    const clickedUniqueName = (clickedAsset as unknown as { uniqueName?: string }).uniqueName ?? "";
    if (clickedUniqueName === KEY_ASSET_UNIQUE_NAME) {
      await clickedAsset.fetchDataObject();
      await initializeKeyAsset(clickedAsset);
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
    return keyAsset;
  } catch (error) {
    throw standardizeError(error);
  }
};
