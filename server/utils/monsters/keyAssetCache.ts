import { KeyAssetDataObject } from "@shared/types/index.js";

/**
 * Per-process cache for the Monster Mash key asset's dataObject + resolved
 * id, keyed by `urlSlug`.
 *
 * Why this exists: `getKeyAsset` costs 2–3 SDK calls per request (clicked-
 * asset fetch, world-level `fetchDroppedAssetsWithUniqueName` fallback, and
 * `fetchDataObject`). Under live-class load every controller pays it, and
 * three tabs' worth of `/main-app` + `/vote` + `/gallery` from a single
 * student all re-fetch the same roster snapshot. A short TTL cache lets the
 * first call per window do the SDK work and the rest serve from memory —
 * for every controller, not just the three visible endpoints.
 *
 * Correctness notes:
 *   - Every write path on the key asset (controllers that call
 *     `keyAsset.updateDataObject` / `setDataObject`) MUST call
 *     `invalidateKeyAssetCache(urlSlug)` right after. The next read
 *     refetches from the SDK and reseeds the cache. Grep for
 *     `invalidateKeyAssetCache` to verify coverage.
 *   - Cross-pod staleness is bounded by `CACHE_TTL_MS`. A pod that didn't
 *     write still sees up-to-TTL-old roster state. Cosmetic: next refresh
 *     clears it. Monster Mash runs with 1–2 pods per env, so this is a
 *     tiny divergence window in practice.
 *   - One Monster Mash key asset per world is assumed (same assumption
 *     the current `fetchDroppedAssetsWithUniqueName` resolver makes:
 *     `matches[0]`). If that ever changes, this cache key needs to grow.
 */

const CACHE_TTL_MS = 10 * 1000;

interface CacheEntry {
  keyAssetId: string;
  dataObject: KeyAssetDataObject;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

export const getCachedKeyAssetData = (urlSlug: string): { keyAssetId: string; dataObject: KeyAssetDataObject } | undefined => {
  const entry = cache.get(urlSlug);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp >= CACHE_TTL_MS) {
    cache.delete(urlSlug);
    return undefined;
  }
  return { keyAssetId: entry.keyAssetId, dataObject: entry.dataObject };
};

export const setCachedKeyAssetData = (urlSlug: string, keyAssetId: string, dataObject: KeyAssetDataObject): void => {
  cache.set(urlSlug, { keyAssetId, dataObject, timestamp: Date.now() });
};

/**
 * Drop the cached entry for a world. Call this right after any
 * `keyAsset.updateDataObject` / `setDataObject` succeeds so the next read
 * sees the fresh state instead of serving the pre-write snapshot.
 */
export const invalidateKeyAssetCache = (urlSlug: string): void => {
  cache.delete(urlSlug);
};

/** Test hook — not called in production code. */
export const clearKeyAssetCache = (): void => {
  cache.clear();
};
