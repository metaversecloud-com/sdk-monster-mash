import { MonsterMashVisitorData } from "@shared/types/index.js";

/**
 * Per-process cache for a peer's `contributedDrafts` map. Populated during
 * the main-app render's peer-picks enrichment pass; hit by subsequent
 * main-app opens from any caller who needs the same peer within the TTL.
 *
 * Why this exists: `enrichDraftsWithPeerPicks` fetches each unique peer's
 * visitor dataObject so the CreateTab can show layered previews of done
 * peer sections. Under live-class load the same peers get fetched over and
 * over by different callers' `/main-app` opens. A 30s TTL cache turns the
 * second-and-later reads into zero SDK calls.
 *
 * Correctness notes:
 *   - A peer who just submitted a new section is visible to other callers
 *     up to 30s later. Matches the UX expectation ("just-submitted" is
 *     already slightly delayed by client caching).
 *   - Writes to the peer's own visitor still happen in-band through the
 *     peer's own controllers (handleSubmitSection, etc.) — those paths
 *     invalidate on write so the submitter sees fresh state immediately.
 *   - Cross-pod: a submit on pod A doesn't invalidate pod B's cache. 30s
 *     worst case; cosmetic.
 */

const CACHE_TTL_MS = 30 * 1000;

interface CacheEntry {
  // `null` is a cacheable negative result (peer visitor has no scoped slot
  // yet). Lets us skip refetching for peers with no drafts.
  drafts: MonsterMashVisitorData["contributedDrafts"] | null;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

const cacheKey = (profileId: string, scopedKey: string) => `${profileId}:${scopedKey}`;

/**
 * Returns the cached peer `contributedDrafts` if fresh, otherwise `undefined`
 * so the caller fetches and stores.
 */
export const getCachedPeerDrafts = (
  peerProfileId: string,
  scopedKey: string,
): MonsterMashVisitorData["contributedDrafts"] | null | undefined => {
  const entry = cache.get(cacheKey(peerProfileId, scopedKey));
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp >= CACHE_TTL_MS) {
    cache.delete(cacheKey(peerProfileId, scopedKey));
    return undefined;
  }
  return entry.drafts;
};

/** Store a freshly-fetched peer `contributedDrafts` (or the `null` negative). */
export const setCachedPeerDrafts = (
  peerProfileId: string,
  scopedKey: string,
  drafts: MonsterMashVisitorData["contributedDrafts"] | null,
): void => {
  cache.set(cacheKey(peerProfileId, scopedKey), { drafts, timestamp: Date.now() });
};

/**
 * Called by the peer's own write paths (submit / draft update) so the
 * peer themselves never sees stale data from this cache. Drops ALL
 * scope-keys for this profile since the submit controller doesn't know
 * which scope-key(s) its visitor data lives under across worlds.
 */
export const invalidatePeerDrafts = (peerProfileId: string): void => {
  const prefix = `${peerProfileId}:`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
};

/** Test hook — not called in production code. */
export const clearPeerDraftsCache = (): void => {
  cache.clear();
};
