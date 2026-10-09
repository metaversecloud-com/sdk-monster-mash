import { BadgeDef } from "@shared/content/badges.js";
import { Section } from "@shared/types/index.js";

/**
 * Everything the badge rules can count, for one player in one world.
 *
 * Each field backs the `thresholdKind` of the same name, except the three
 * that take a per-badge qualifier: `winCategory` reads `wonCategories`,
 * `submitSection` reads `sectionSubmits`, and `weeksWithMinVotes` reads
 * `votesPerWeek`.
 */
export interface BadgeCounters {
  // building
  /** Monsters this player started (submitted the first section of). */
  monstersStarted?: number;
  /** Distinct weeks in which they started at least one monster. */
  weeksStartedMonster?: number;
  /** Sections submitted, counted per section type. */
  sectionSubmits?: Partial<Record<Section, number>>;
  /** Times they joined someone else's in-progress monster. */
  joinedMonster?: number;
  /** Times they completed the 3rd section on someone else's monster. */
  completeAsThird?: number;

  // voting
  /** Votes cast, all time. */
  vote?: number;
  /** Distinct weeks in which they voted at least once. */
  weeksVoted?: number;
  /** Most votes cast within any single week. */
  votesInSingleWeek?: number;
  /** Votes cast in each week they voted — drives `weeksWithMinVotes`. */
  votesPerWeek?: number[];

  // visiting
  /** Distinct days they opened the app. */
  visitAppOpens?: number;

  // winning
  /** Voting categories they've won at least once. */
  wonCategories?: Set<string>;
  /** Total awards won (1st/2nd/3rd across all weeks). */
  awardsWon?: number;
}

/**
 * Given the badge catalog (from `getBadgeCatalog`), counters, and
 * already-owned badge names, return the badges the player should now be
 * granted.
 *
 * Threshold semantics: grant when the counted value is ≥ `threshold`.
 *
 * A badge with an incomplete rule is skipped, never granted:
 *   - `thresholdKind` or `threshold` null — no rule in the item's metadata.
 *   - `winCategory` with no `categoryId`, `submitSection` with no `sectionId`,
 *     `weeksWithMinVotes` with no `minVotesPerWeek` — missing qualifier.
 * These still appear in the Trophy grid; they just can't be earned until
 * their metadata is filled in on the inventory item.
 */
export const evaluateBadges = <T extends BadgeDef>(
  badges: readonly T[],
  counters: BadgeCounters,
  ownedBadgeNames: Set<string>,
): T[] => {
  const toGrant: T[] = [];

  for (const badge of badges) {
    if (ownedBadgeNames.has(badge.name)) continue;
    const { thresholdKind, threshold } = badge;
    if (!thresholdKind || threshold === null) continue;

    let counted: number;
    switch (thresholdKind) {
      case "winCategory":
        if (!badge.categoryId) continue;
        counted = counters.wonCategories?.has(badge.categoryId) ? 1 : 0;
        break;

      case "submitSection":
        if (!badge.sectionId) continue;
        counted = counters.sectionSubmits?.[badge.sectionId] ?? 0;
        break;

      case "weeksWithMinVotes": {
        const min = badge.minVotesPerWeek;
        if (min === null) continue;
        counted = (counters.votesPerWeek ?? []).filter((v) => v >= min).length;
        break;
      }

      default:
        counted = counters[thresholdKind] ?? 0;
        break;
    }

    if (counted >= threshold) toGrant.push(badge);
  }

  return toGrant;
};
