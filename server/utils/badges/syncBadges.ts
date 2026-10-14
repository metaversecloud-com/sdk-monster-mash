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
 *   - every counter lives on the player's own visitor dataObject, so each
 *     player picks up their badges on their own next open with no
 *     cross-profile fanout
 */
export const syncBadges = async ({
  credentials,
  visitor,
  visitorData,
  ownedBadgeNames,
  forceRefreshInventory = false,
}: SyncBadgesInput): Promise<string[]> => {
  try {
    const { profileId, urlSlug } = credentials;

    const catalog = await getBadgeCatalog(credentials, { forceRefresh: forceRefreshInventory });
    // An empty catalog means "ecosystem unreachable", not "no badges".
    if (catalog.length === 0) return [];

    const toGrant = evaluateBadges(catalog, buildBadgeCounters(visitorData), ownedBadgeNames);
    if (toGrant.length === 0) return [];

    const granted: typeof toGrant = [];
    for (const badge of toGrant) {
      try {
        await visitor.grantInventoryItem(badge.inventoryItem, 1);
        granted.push(badge);
        ownedBadgeNames.add(badge.name);
      } catch (error) {
        console.warn(`syncBadges: failed to grant "${badge.name}"`, error);
      }
    }

    // Fire a platform toast per newly-granted badge so the user actually
    // sees that they just earned something. `grantInventoryItem` is silent
    // on its own — matches the sdk-badges reference pattern. Fire-and-
    // forget: a failed toast must not block the badge grant that already
    // succeeded.
    for (const badge of granted) {
      visitor
        .fireToast({
          groupId: `mm-badge-${badge.name}`,
          title: `You unlocked the ${badge.displayName || badge.name} badge!`,
          text: badge.description || "",
        })
        .catch((error) => console.warn(`syncBadges: badge toast failed for "${badge.name}"`, error));
    }

    const grantedNames = granted.map((b) => b.name);
    if (granted.length > 0) {
      console.log(`syncBadges: granted ${granted.length} badge(s) to ${profileId}: ${grantedNames.join(", ")}`);
      // One `badge_earned` analytic per newly-granted badge, batched into a
      // single no-op visitor write so we don't fan out one request per
      // grant. Dedup per (profile, badge name) — grants are already gated
      // on `ownedBadgeNames` so a second grant can't fire anyway, but the
      // uniqueKey keeps the analytic layer safe if the ecosystem re-grants.
      try {
        await visitor.updateDataObject(
          {},
          {
            analytics: grantedNames.map(() => ({
              analyticName: "badge_earned",
              profileId,
              urlSlug,
              uniqueKey: profileId,
            })),
          },
        );
      } catch (error) {
        console.warn("syncBadges: badge_earned analytic write failed", error);
      }
    }
    return grantedNames;
  } catch (error) {
    console.warn("syncBadges: unexpected error", error);
    return [];
  }
};
