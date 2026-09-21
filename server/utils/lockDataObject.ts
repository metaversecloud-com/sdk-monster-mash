import { DroppedAssetInterface, VisitorInterface } from "@rtsdk/topia";

/**
 * Acquire the SDK's dataObject lock without immediately releasing it, so a
 * follow-up `updateDataObject(payload, { lock: { lockId, releaseLock: true } })`
 * can do the real write. Second caller passing the same `lockId` will throw,
 * which the caller catches and turns into a 409.
 *
 * Mirrors the tic-tac-toe pattern (`lockDataObject.ts`), typed for both
 * DroppedAsset and Visitor targets.
 */
export const lockDataObject = async (
  lockId: string,
  recordToLock: DroppedAssetInterface | VisitorInterface,
): Promise<void> => {
  await recordToLock.updateDataObject({}, { lock: { lockId, releaseLock: false } });
};
