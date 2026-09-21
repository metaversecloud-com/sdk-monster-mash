/**
 * Monster Mash badge catalog. 38 badges grouped into four Trophy-drawer
 * sections (mockup image24). Names match the spec verbatim so the ecosystem
 * inventory lookup by name works — the ecosystem holds the artwork; this
 * file only knows the tag + threshold.
 *
 * `thresholdKind` describes what counters/state trigger the grant:
 *   - buildSubmit: total sections submitted
 *   - buildComplete: total monsters this profile helped complete (any section)
 *   - completeAsThird: total times this profile submitted the THIRD (finishing) section
 *   - vote: total votes cast
 *   - weeksVoted: distinct weeks this profile voted in
 *   - visitAppOpens: distinct app-open days
 *   - winCategory: monsters with an award — one badge per voting category, name
 *     stored as `Winner: {Category} Monster`
 *
 * Grant policy: check when the underlying counter changes. `grantBadgeIfNew`
 * looks up whether the ecosystem badge already exists in the visitor's
 * inventory before granting.
 */

export type BadgeGroup = "building" | "voting" | "visiting" | "winning";

export type BadgeThresholdKind =
  | "buildSubmit"
  | "buildComplete"
  | "completeAsThird"
  | "vote"
  | "weeksVoted"
  | "visitAppOpens"
  | "winCategory";

export interface BadgeDef {
  name: string;
  group: BadgeGroup;
  thresholdKind: BadgeThresholdKind;
  threshold: number;
  /** For winCategory badges — which voting category triggers this badge. */
  categoryId?: string;
}

const BUILDING: BadgeDef[] = [
  { name: "Brainstormer", group: "building", thresholdKind: "buildSubmit", threshold: 1 },
  { name: "Body Builder", group: "building", thresholdKind: "buildSubmit", threshold: 5 },
  { name: "Best Foot Forward", group: "building", thresholdKind: "buildSubmit", threshold: 10 },
  { name: "It's Alive!", group: "building", thresholdKind: "completeAsThird", threshold: 1 },
  { name: "Spark of Life", group: "building", thresholdKind: "completeAsThird", threshold: 5 },
  { name: "Mad Scientist", group: "building", thresholdKind: "completeAsThird", threshold: 10 },
];

const VOTING: BadgeDef[] = [
  { name: "I Voted!", group: "voting", thresholdKind: "vote", threshold: 1 },
  { name: "Obsessed Voter", group: "voting", thresholdKind: "vote", threshold: 25 },
  { name: "Voting Legend", group: "voting", thresholdKind: "weeksVoted", threshold: 5 },
];

const VISITING: BadgeDef[] = [
  { name: "New Masher", group: "visiting", thresholdKind: "visitAppOpens", threshold: 1 },
  { name: "Elite Masher", group: "visiting", thresholdKind: "visitAppOpens", threshold: 10 },
  { name: "Legendary Masher", group: "visiting", thresholdKind: "visitAppOpens", threshold: 30 },
];

const WINNING = ["silliest", "cutest", "grumpiest", "best-dressed", "spookiest", "friendliest", "sneakiest", "wisest", "bravest", "weirdest"].map(
  (categoryId): BadgeDef => ({
    name: `Winner: ${toDisplay(categoryId)} Monster`,
    group: "winning",
    thresholdKind: "winCategory",
    threshold: 1,
    categoryId,
  }),
);

function toDisplay(id: string): string {
  return id
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

export const BADGES: readonly BadgeDef[] = [...BUILDING, ...VOTING, ...VISITING, ...WINNING];

export const BADGE_BY_NAME: Record<string, BadgeDef> = BADGES.reduce(
  (acc, b) => {
    acc[b.name] = b;
    return acc;
  },
  {} as Record<string, BadgeDef>,
);
