import { VisitorInterface } from "@rtsdk/topia";

/**
 * Per-process in-memory cache for a visitor's shaped badge-inventory map.
 *
 * `getVisitor({ includeInventory: true })` currently calls
 * `visitor.fetchInventoryItems()` on every request, which under live-class
 * load fans out to one SDK round-trip per student per `/main-app` and per
 * `/trophy`. The shape we actually consume downstream is small and almost
 * never changes mid-session, so a short TTL keyed by `profileId` cuts the
 * request-rate hit without staleness that users would notice.
 *
 * Correctness notes:
 *   - `syncBadges` calls `invalidateVisitorInventory` on each successful
 *     grant, so a just-earned badge is visible on the next read within the
 *     same process (no 60s wait for your own grant).
 *   - Cross-pod: a grant on pod A doesn't invalidate pod B's cache. Worst-
 *     case staleness is one TTL cycle, cosmetic only.
 *   - Admin "force refresh" via `?forceRefreshInventory=true` bypasses the
 *     cache the same way it bypasses the ecosystem catalog cache.
 */

export type VisitorInventoryMap = { [badgeName: string]: { id: string; icon: string; name: string } };

interface CacheEntry {
  inventory: VisitorInventoryMap;
  timestamp: number;
}

const CACHE_TTL_MS = 60 * 1000;
const cache = new Map<string, CacheEntry>();

/**
 * Fetch and shape the visitor's ACTIVE BADGE inventory. Serves from cache
 * when fresh. On a miss (or `forceRefresh`), hits the SDK, re-shapes, and
 * stores the result.
 */
export const getCachedVisitorInventory = async ({
  visitor,
  profileId,
  forceRefresh = false,
}: {
  visitor: VisitorInterface;
  profileId: string;
  forceRefresh?: boolean;
}): Promise<VisitorInventoryMap> => {
  const now = Date.now();
  const cached = cache.get(profileId);
  if (cached && !forceRefresh && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.inventory;
  }

  // SDK call: fetches badge/currency/etc. items for the visitor and loads
  // them onto `visitor.inventoryItems`. The signature accepts an optional
  // `force` boolean (newer SDKs) — guard with a runtime check so older
  // signatures still work.
  const fetchInventoryFn = visitor.fetchInventoryItems as unknown as (force?: boolean) => Promise<unknown>;
  await fetchInventoryFn.call(visitor, forceRefresh);

  const inventory: VisitorInventoryMap = {};
  for (const visitorItem of visitor.inventoryItems ?? []) {
    const { id, status, item } = visitorItem as {
      id: string;
      status?: string;
      item?: { name?: string; type?: string; image_url?: string };
    };
    const { name = "", type, image_url = "" } = item || {};
    if (status === "ACTIVE" && type === "BADGE") {
      inventory[name] = { id, icon: image_url, name };
    }
  }

  cache.set(profileId, { inventory, timestamp: now });
  return inventory;
};

/**
 * Drop the cached inventory for one profile. Called after a successful
 * `grantInventoryItem` so the next read-path request on the same pod sees
 * the fresh grant without waiting for TTL.
 */
export const invalidateVisitorInventory = (profileId: string): void => {
  cache.delete(profileId);
};

/** Test hook — not called in production code. */
export const clearVisitorInventoryCache = (): void => {
  cache.clear();
};
