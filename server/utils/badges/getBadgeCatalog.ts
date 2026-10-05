import { BadgeDef, parseBadgeDef, sortBadgeDefs } from "@shared/content/badges.js";
import { Credentials } from "../../types/index.js";
import { getCachedInventoryItems } from "../inventoryCache.js";

export interface BadgeCatalogEntry extends BadgeDef {
  /** Ecosystem inventory item id. */
  id: string;
  /** Catalog art, used for locked (unowned) tiles in the Trophy grid. */
  iconUrl: string;
  /**
   * The raw inventory item instance from the ecosystem cache. Passed to
   * `visitor.grantInventoryItem(item, quantity)` — the SDK expects the
   * full item, not just its id.
   */
  inventoryItem: any;
}

/**
 * The app's badge catalog: every live BADGE item on the interactive key,
 * shaped into `BadgeDef`s from each item's `metadata`.
 *
 * The ecosystem is the source of truth — art, grouping, order AND grant
 * rules all live on the inventory item (loaded from the import ZIP, see
 * `docs/claude/inventory-zip-format.md`), so adding or retuning a badge is
 * an inventory import rather than a deploy. INACTIVE items are already
 * stripped by `getCachedInventoryItems`, which is how the not-yet-live
 * voting-category winner badges stay off the grid and un-awardable.
 *
 * Returns `[]` when the ecosystem is unreachable and nothing is cached.
 * Callers must read an empty catalog as "don't know" — never as "no badges
 * exist" — so a transient failure can't wipe the Trophy grid or mis-grant.
 */
export const getBadgeCatalog = async (
  credentials: Credentials,
  options: { forceRefresh?: boolean } = {},
): Promise<BadgeCatalogEntry[]> => {
  try {
    const items = await getCachedInventoryItems({ credentials, forceRefresh: options.forceRefresh });

    const entries: BadgeCatalogEntry[] = [];
    for (const item of items) {
      const { id, name, type, metadata, image_path } = item;
      if (type !== "BADGE" || !id || !name) continue;
      const def = parseBadgeDef(name, metadata);
      if (!def) continue;
      entries.push({ ...def, id, iconUrl: image_path || "", inventoryItem: item });
    }

    return sortBadgeDefs(entries) as BadgeCatalogEntry[];
  } catch (error) {
    console.warn("getBadgeCatalog: could not load badge catalog from ecosystem", error);
    return [];
  }
};
