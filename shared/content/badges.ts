/**
 * Badge shape + the reader that turns an ecosystem inventory item into one.
 *
 * The badge catalog is NOT defined here — the ecosystem is the source of
 * truth for badge art, presence, grouping AND grant rules. Badges are loaded
 * into a deployment from an inventory import ZIP (see
 * `docs/claude/inventory-zip-format.md`); each BADGE item carries its rule in
 * `metadata`. The server reads the catalog at request time via
 * `getBadgeCatalog` and feeds it to `evaluateBadges`.
 */

import { Section } from "../types/SharedTypes.js";

export type BadgeGroup = "building" | "voting" | "visiting" | "winning";

/**
 * What a badge counts. Each maps to one field on `BadgeCounters`, except
 * the three that take a qualifier from metadata:
 *   - `winCategory`      → `categoryId`
 *   - `submitSection`    → `sectionId`
 *   - `weeksWithMinVotes`→ `minVotesPerWeek`
 */
export type BadgeThresholdKind =
  // building
  | "monstersStarted" // Mad Scientist
  | "weeksStartedMonster" // Really / Extremely Mad Scientist
  | "submitSection" // Brainstormer, Body Builder, Best Foot Forward
  | "joinedMonster" // Lab Partner
  | "completeAsThird" // It's Alive!, Spark of Life, Super Collaborator, Master Builder
  // voting
  | "vote" // I Voted!, Vote Monster
  | "weeksVoted" // Repeat Voter, Voting Enthusiast, Voting Legend
  | "votesInSingleWeek" // Monster Judge, Obsessed Voter
  | "weeksWithMinVotes" // Still Voting
  // visiting
  | "visitAppOpens" // New / Elite / Legendary Masher
  // winning
  | "winCategory" // Winner: {category}
  | "awardsWon"; // Monster Hall of Fame

export const BADGE_GROUPS: readonly BadgeGroup[] = ["building", "voting", "visiting", "winning"] as const;

const THRESHOLD_KINDS: readonly BadgeThresholdKind[] = [
  "monstersStarted",
  "weeksStartedMonster",
  "submitSection",
  "joinedMonster",
  "completeAsThird",
  "vote",
  "weeksVoted",
  "votesInSingleWeek",
  "weeksWithMinVotes",
  "visitAppOpens",
  "winCategory",
  "awardsWon",
] as const;

const SECTION_IDS: readonly Section[] = ["head", "torso", "legs"] as const;

/**
 * The `metadata` object on an ecosystem BADGE inventory item.
 *
 * `thresholdKind` is null for a badge with no grant rule yet — it still shows
 * in the Trophy grid but is never auto-granted.
 */
export interface BadgeMetadata {
  displayName?: string;
  sortOrder?: number;
  group?: BadgeGroup;
  thresholdKind?: BadgeThresholdKind | null;
  threshold?: number | null;
  /** `winCategory` only — which voting category triggers this badge. */
  categoryId?: string | null;
  /** `submitSection` only — which monster section must be submitted. */
  sectionId?: Section | null;
  /** `weeksWithMinVotes` only — votes needed in a week for it to count. */
  minVotesPerWeek?: number | null;
}

export interface BadgeDef {
  /** Ecosystem item name — the key everything else joins on. */
  name: string;
  displayName: string;
  group: BadgeGroup;
  sortOrder: number;
  /** Null when the badge has no grant rule yet; `evaluateBadges` skips it. */
  thresholdKind: BadgeThresholdKind | null;
  threshold: number | null;
  categoryId: string | null;
  sectionId: Section | null;
  minVotesPerWeek: number | null;
}

const isBadgeGroup = (value: unknown): value is BadgeGroup => BADGE_GROUPS.includes(value as BadgeGroup);

const isThresholdKind = (value: unknown): value is BadgeThresholdKind =>
  THRESHOLD_KINDS.includes(value as BadgeThresholdKind);

const isSection = (value: unknown): value is Section => SECTION_IDS.includes(value as Section);

/**
 * Build a `BadgeDef` from an ecosystem BADGE item's name + metadata.
 *
 * Returns null when `group` is missing or unrecognized — a badge we can't
 * place in the Trophy grid is treated as not part of this app's catalog
 * (the interactive key may carry badges for other purposes). An unrecognized
 * `thresholdKind` degrades to null rather than dropping the badge, so bad
 * metadata costs a grant rule, not the badge itself.
 */
export const parseBadgeDef = (name: string, metadata: unknown): BadgeDef | null => {
  if (!name) return null;
  const meta = (metadata ?? {}) as BadgeMetadata;
  if (!isBadgeGroup(meta.group)) return null;

  return {
    name,
    displayName: meta.displayName || name,
    group: meta.group,
    sortOrder: typeof meta.sortOrder === "number" ? meta.sortOrder : Number.MAX_SAFE_INTEGER,
    thresholdKind: isThresholdKind(meta.thresholdKind) ? meta.thresholdKind : null,
    threshold: typeof meta.threshold === "number" ? meta.threshold : null,
    categoryId: meta.categoryId || null,
    sectionId: isSection(meta.sectionId) ? meta.sectionId : null,
    minVotesPerWeek: typeof meta.minVotesPerWeek === "number" ? meta.minVotesPerWeek : null,
  };
};

/** Catalog display order: `sortOrder` asc, name asc as a stable tiebreak. */
export const sortBadgeDefs = (badges: readonly BadgeDef[]): BadgeDef[] =>
  [...badges].sort((a, b) => (a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.name.localeCompare(b.name)));

export const indexBadgesByName = (badges: readonly BadgeDef[]): Record<string, BadgeDef> =>
  badges.reduce(
    (acc, b) => {
      acc[b.name] = b;
      return acc;
    },
    {} as Record<string, BadgeDef>,
  );
