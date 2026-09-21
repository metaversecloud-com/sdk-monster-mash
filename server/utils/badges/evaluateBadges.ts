import { BADGES, BadgeDef } from "@shared/content/badges.js";

export interface BadgeCounters {
  buildSubmit?: number;
  buildComplete?: number;
  completeAsThird?: number;
  vote?: number;
  weeksVoted?: number;
  visitAppOpens?: number;
  wonCategories?: Set<string>;
}

/**
 * Given counters + already-owned badge names, return the badge defs the
 * target should now be granted. Threshold semantics: grant when the counter
 * is ≥ the badge's threshold. `winCategory` grants when the target has won
 * in that category at least once.
 */
export const evaluateBadges = (counters: BadgeCounters, ownedBadgeNames: Set<string>): BadgeDef[] => {
  const toGrant: BadgeDef[] = [];
  for (const badge of BADGES) {
    if (ownedBadgeNames.has(badge.name)) continue;
    let qualifies = false;
    switch (badge.thresholdKind) {
      case "buildSubmit":
        qualifies = (counters.buildSubmit ?? 0) >= badge.threshold;
        break;
      case "buildComplete":
        qualifies = (counters.buildComplete ?? 0) >= badge.threshold;
        break;
      case "completeAsThird":
        qualifies = (counters.completeAsThird ?? 0) >= badge.threshold;
        break;
      case "vote":
        qualifies = (counters.vote ?? 0) >= badge.threshold;
        break;
      case "weeksVoted":
        qualifies = (counters.weeksVoted ?? 0) >= badge.threshold;
        break;
      case "visitAppOpens":
        qualifies = (counters.visitAppOpens ?? 0) >= badge.threshold;
        break;
      case "winCategory":
        qualifies = !!(badge.categoryId && counters.wonCategories?.has(badge.categoryId));
        break;
    }
    if (qualifies) toGrant.push(badge);
  }
  return toGrant;
};
