import { VisitorInterface } from "@rtsdk/topia";
import { MonsterMashVisitorData } from "@shared/types/index.js";
import { Credentials } from "../../types/index.js";
import { buildBadgeCounters } from "./buildBadgeCounters.js";
import { evaluateBadges } from "./evaluateBadges.js";
import { getBadgeCatalog } from "./getBadgeCatalog.js";

export interface SyncBadgesInput {
  credentials: Credentials;
  visitor: VisitorInterface;
  visitorData: MonsterMashVisitorData;
  /** Badge names the caller already owns, from `getVisitor({ includeInventory: true })`. */
  ownedBadgeNames: Set<string>;
  forceRefreshInventory?: boolean;
}

/**
 * Evaluate the caller's counters against the live badge catalog and grant
 * whatever they've newly earned. Returns the names granted.
 *
 * Runs on the read paths (`/main-app`, `/trophy`) rather than inside every
 * action, because:
 *   - it needs the caller's owned-badge set, which costs an inventory
 *     fetch; doing that on every vote would be an API call per vote
 *   - the spec already frames rewards as "the first time a player opens
 *     the app after …", so the open is the natural moment
 *   - every counter lives on the player's own visitor dataObject, so each
 *     player picks up their badges on their own next open with no
 *     cross-profile fanout
 *
 * Never throws — a badge grant must not fail the request that triggered it.
 */
export const syncBadges = async ({
  credentials,
  visitor,
  visitorData,
  ownedBadgeNames,
  forceRefreshInventory = false,
}: SyncBadgesInput): Promise<string[]> => {
  try {
    const catalog = await getBadgeCatalog(credentials, { forceRefresh: forceRefreshInventory });
    // An empty catalog means "ecosystem unreachable", not "no badges".
    if (catalog.length === 0) return [];

    const toGrant = evaluateBadges(catalog, buildBadgeCounters(visitorData), ownedBadgeNames);
    if (toGrant.length === 0) return [];

    const granted: string[] = [];
    for (const badge of toGrant) {
      try {
        // SDK contract: pass the inventory item instance + quantity, NOT an
        // object with inventoryItemId. The item comes straight from the
        // ecosystem cache via `getBadgeCatalog` → `badge.inventoryItem`.
        await visitor.grantInventoryItem(badge.inventoryItem, 1);
        granted.push(badge.name);
        ownedBadgeNames.add(badge.name);
      } catch (error) {
        console.warn(`syncBadges: failed to grant "${badge.name}"`, error);
      }
    }

    if (granted.length > 0) {
      console.log(`syncBadges: granted ${granted.length} badge(s) to ${credentials.profileId}: ${granted.join(", ")}`);
    }
    return granted;
  } catch (error) {
    console.warn("syncBadges: unexpected error", error);
    return [];
  }
};
