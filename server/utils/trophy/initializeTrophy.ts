import { DroppedAssetInterface } from "@rtsdk/topia";
import { TrophyDataObject } from "@shared/types/index.js";
import { standardizeError } from "../standardizeError.js";

/**
 * Idempotent initializer for the Trophy dropped asset's dataObject.
 * Same shape as `initializeKeyAsset` — if `schemaVersion !== 1` we treat
 * the record as fresh and write defaults; otherwise leave it alone.
 */
export const initializeTrophy = async (trophyAsset: DroppedAssetInterface) => {
  try {
    await trophyAsset.fetchDataObject();
    const existing = (trophyAsset.dataObject || {}) as Partial<TrophyDataObject>;

    if (existing.schemaVersion === 1) return;

    const defaults: TrophyDataObject = {
      schemaVersion: 1,
      leaderboard: {},
    };

    const lockId = `${trophyAsset.id}-init-${new Date(Math.round(Date.now() / 60000) * 60000).toISOString()}`;
    await trophyAsset
      .setDataObject(defaults, { lock: { lockId, releaseLock: true } })
      .catch(() => console.warn("initializeTrophy: lock contention, another process initialized first"));

    await trophyAsset.fetchDataObject();
  } catch (error) {
    throw standardizeError(error);
  }
};
