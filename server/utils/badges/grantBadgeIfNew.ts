import { UserInterface, VisitorInterface } from "@rtsdk/topia";
import { Credentials } from "../../types/index.js";
import { Ecosystem } from "../topiaInit.js";

export interface GrantBadgeIfNewInput {
  target: VisitorInterface | UserInterface;
  credentials: Credentials;
  badgeName: string;
  /** Set of badge names the target already owns; skip the SDK read when supplied. */
  ownedBadgeNames?: Set<string>;
}

export interface GrantBadgeResult {
  granted: boolean;
  skippedReason?: string;
}

/**
 * Grant an ecosystem badge to a target visitor/user IF they don't already own
 * it. Skips silently when the badge lookup fails or the ecosystem doesn't
 * expose the named badge (spec: ecosystem is the source of truth for badge
 * catalog art + presence — we only look up by name).
 *
 * Follows the sdk-tictactoe `grantBadgeIfNew` pattern.
 */
export const grantBadgeIfNew = async ({
  target,
  credentials,
  badgeName,
  ownedBadgeNames,
}: GrantBadgeIfNewInput): Promise<GrantBadgeResult> => {
  try {
    let owned = ownedBadgeNames;
    if (!owned) {
      await target.fetchInventoryItems().catch(() => {});
      owned = new Set();
      for (const item of (target as any).inventoryItems ?? []) {
        if (item?.status === "ACTIVE" && item?.item?.type === "BADGE") owned.add(item.item.name);
      }
    }
    if (owned.has(badgeName)) return { granted: false, skippedReason: "already-owned" };

    // Look up the badge id via ecosystem.
    const ecosystem = (Ecosystem as any).create?.({ credentials }) ?? Ecosystem;
    let badgeId: string | undefined;
    try {
      const items = await (ecosystem as any).fetchInventoryItems?.().catch(() => []);
      const list = Array.isArray(items) ? items : items?.inventoryItems ?? [];
      for (const item of list) {
        if (item?.item?.type === "BADGE" && item?.item?.name === badgeName) {
          badgeId = item?.item?.id ?? item?.id;
          break;
        }
      }
    } catch (error) {
      // Non-fatal — the ecosystem may not be reachable in tests / dev.
    }
    if (!badgeId) return { granted: false, skippedReason: "badge-not-in-ecosystem" };

    try {
      await (target as any).grantInventoryItem?.({ inventoryItemId: badgeId, quantity: 1 });
    } catch (error) {
      return { granted: false, skippedReason: "grant-failed" };
    }
    return { granted: true };
  } catch (error) {
    console.warn(`grantBadgeIfNew: unexpected error granting "${badgeName}"`, error);
    return { granted: false, skippedReason: "unexpected-error" };
  }
};
