import { DroppedAssetInterface } from "@rtsdk/topia";
import { Credentials } from "../../types/index.js";
import { DroppedAsset } from "../topiaInit.js";
import { initializeKeyAsset } from "./initializeKeyAsset.js";
import { standardizeError } from "../standardizeError.js";

/**
 * Fetch the Monster Mash key asset (the asset the caller just clicked)
 * and ensure its dataObject is initialized. Every controller that reads
 * roster / cycle / window state starts here.
 */
export const getKeyAsset = async (credentials: Credentials): Promise<DroppedAssetInterface> => {
  try {
    const { assetId, urlSlug } = credentials;
    const keyAsset = await DroppedAsset.get(assetId, urlSlug, { credentials });
    if (!keyAsset) throw new Error("Monster Mash key asset not found");
    await initializeKeyAsset(keyAsset);
    return keyAsset;
  } catch (error) {
    throw standardizeError(error);
  }
};
