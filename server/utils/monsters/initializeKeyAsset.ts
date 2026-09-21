import { DroppedAssetInterface } from "@rtsdk/topia";
import { VOTING_CATEGORIES } from "@shared/content/monsterMash.js";
import { KeyAssetDataObject } from "@shared/types/index.js";
import { currentSubmissionWindow } from "../vote/computeWindows.js";
import { standardizeError } from "../standardizeError.js";

/**
 * Idempotent initializer for the Monster Mash key asset's dataObject.
 * Missing = first-open — `setDataObject` writes the default schema.
 * Anything present is left alone so upgrades add fields without clobbering
 * live rosters.
 *
 * Match the boilerplate pattern from `initializeDroppedAssetDataObject`:
 * `setDataObject` under a per-minute lockId so concurrent first-opens
 * don't stomp each other.
 */
export const initializeKeyAsset = async (keyAsset: DroppedAssetInterface) => {
  try {
    await keyAsset.fetchDataObject();
    const existing = (keyAsset.dataObject || {}) as Partial<KeyAssetDataObject>;

    if (existing.schemaVersion === 1) return;

    const defaults: KeyAssetDataObject = {
      schemaVersion: 1,
      timezone: "America/New_York",
      weeklyVotingEnabled: true,
      howToImageUrl: null,
      monsters: {},
      currentSubmissionWindow: currentSubmissionWindow(),
      currentVoteCycle: null,
      storedWinners: [],
      categorySchedule: {
        orderIds: VOTING_CATEGORIES.map((c) => c.id),
        nextIndex: 0,
      },
    };

    const lockId = `${keyAsset.id}-init-${new Date(Math.round(Date.now() / 60000) * 60000).toISOString()}`;
    await keyAsset
      .setDataObject(defaults, { lock: { lockId, releaseLock: true } })
      .catch(() => console.warn("initializeKeyAsset: lock contention, another process initialized first"));

    await keyAsset.fetchDataObject();
  } catch (error) {
    throw standardizeError(error);
  }
};
