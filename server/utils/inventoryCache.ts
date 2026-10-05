import { InventoryItemInterface } from "@rtsdk/topia";
import { Credentials } from "../types/index.js";
import { Ecosystem } from "./topiaInit.js";
import { standardizeError } from "./standardizeError.js";

interface CachedInventory {
  items: InventoryItemInterface[];
  timestamp: number;
}

const CACHE_DURATION_MS = 6 * 60 * 60 * 1000;
let inventoryCache: CachedInventory | null = null;

/**
 * Get ecosystem inventory items with caching.
 * - Serves from cache when present and not expired
 * - Refetches when expired, missing, or `forceRefresh` is passed
 * - Falls back to a stale cache rather than failing a request
 */
export const getCachedInventoryItems = async ({
  credentials,
  forceRefresh = false,
}: {
  credentials: Credentials;
  forceRefresh?: boolean;
}): Promise<InventoryItemInterface[]> => {
  try {
    const now = Date.now();
    const isCacheValid = inventoryCache !== null && !forceRefresh && now - inventoryCache.timestamp < CACHE_DURATION_MS;
    if (isCacheValid) return inventoryCache!.items;

    const ecosystem = await Ecosystem.create({ credentials });
    await ecosystem.fetchInventoryItems();

    // INACTIVE items are stripped at the cache layer so every downstream
    // consumer (badges, drops, etc.) gets a clean list — they shouldn't
    // render, unlock, or reward an item the ecosystem has retired. Monster
    // Mash ships the eight not-yet-live voting-category winner badges as
    // INACTIVE; this is what keeps them off the Trophy grid and un-awardable
    // until their category launches.
    inventoryCache = {
      items: ((ecosystem.inventoryItems as InventoryItemInterface[]) || []).filter(
        (item) => (item as any)?.status !== "INACTIVE",
      ),
      timestamp: now,
    };
    return inventoryCache.items;
  } catch (error) {
    if (inventoryCache !== null) {
      console.warn("Failed to fetch fresh inventory, using stale cache", error);
      return inventoryCache.items;
    }
    throw standardizeError(error);
  }
};

export const clearInventoryCache = (): void => {
  inventoryCache = null;
};
