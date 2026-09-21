import { AwardRibbon, Place, Section } from "./SharedTypes.js";
import { MonsterIndexEntry, StoredWinner, SubmissionWindow, VoteCycle } from "./KeyAssetData.js";

export interface VisitorSummary {
  visitorId: number;
  profileId: string;
  displayName: string;
  isAdmin: boolean;
}

export interface WinBannerPayload {
  monsterId: string;
  monsterName: string;
  category: string;
  place: Place;
  awardedAt: number;
}

export interface CompletionBannerPayload {
  monsterId: string;
  monsterName: string;
  completedAt: number;
}

export interface BannerBundle {
  /** Most-recent win the caller hasn't seen yet, if any. */
  win: WinBannerPayload | null;
  /** Most-recent monster-just-completed by the caller's team, if any. */
  completion: CompletionBannerPayload | null;
  /** True when a vote cycle is currently running. */
  hasActiveVoteCycle: boolean;
  /** True when the app has scheduled a "next week's category" reminder. */
  hasNextCategoryReminder: boolean;
}

export interface ActiveDraftSummary {
  monsterId: string;
  section: Section;
  lockedAt: number;
  lastActivityAt: number;
  picks: { [categoryId: string]: string };
  nameToken?: string;
}

/**
 * Flattened monster shape the Gallery + Single Monster View surfaces
 * consume. Union of what the roster + visitor.contributedMonsters both
 * expose — `imageUrl` is populated once finalize succeeds; a finalize
 * failure leaves it null and the card renders a fallback state.
 */
export interface GalleryMonster {
  monsterId: string;
  monsterAssetId?: string;
  name: string;
  birthdate: number;
  imageUrl: string | null;
  contributorProfileIds: string[];
  contributorDisplayNames: string[];
  latestAward?: AwardRibbon;
  /** Convenience flag — true when the caller has any submitted section on this monster. */
  callerContributed: boolean;
  /** `true` when this monster is no longer on the key-asset roster (surfaced from visitor.contributedMonsters). */
  fromCallerHistory: boolean;
}

export interface GalleryResponseData {
  monsters: GalleryMonster[];
  filter: { mine: boolean; winners: boolean };
  sort: "newest" | "oldest";
  totalOnRoster: number;
  totalInCallerHistory: number;
}

export interface SingleMonsterResponseData {
  monster: GalleryMonster;
  /** Full section records (only present when the monster is on the roster OR the caller contributed and has metadata). */
  sections?: { head: SectionRecordSummary; torso: SectionRecordSummary; legs: SectionRecordSummary };
  canDelete: boolean;
}

export interface TrophyLeaderboardRow {
  rank: number;
  profileId: string;
  displayName: string;
  awardsWon: number;
  monstersContributedTo: number;
  isCaller: boolean;
}

export interface TrophyBadgeRow {
  name: string;
  group: "building" | "voting" | "visiting" | "winning";
  owned: boolean;
  iconUrl?: string;
}

export interface TrophyResponseData {
  leaderboard: TrophyLeaderboardRow[];
  callerRow?: TrophyLeaderboardRow;
  cap: number;
  badges: TrophyBadgeRow[];
  ownedBadgesCount: number;
  totalBadges: number;
  isAdmin: boolean;
}

export interface VoteMatchupPayload {
  matchupId: string;
  pair: [GalleryMonster, GalleryMonster];
}

export interface StoredWinnerPayload {
  monsterId: string;
  name: string;
  imageUrl: string | null;
  contributorDisplayNames: string[];
  place: Place;
  category: string;
  awardedAt: number;
  deleted: boolean;
}

export type VoteTabState = "scheduled" | "running" | "not-enough-monsters" | "voting-off";

export interface VoteResponseData {
  state: VoteTabState;
  category?: string; // "silliest" | "cutest" | …
  categoryQuestion?: string; // "Silliest" — fills "Which one is the ___?"
  cycleEndsAt?: number;
  poolSize?: number;
  minPoolSize: number;
  nextScheduledStartAt?: number;
  weeklyVotingEnabled: boolean;
  matchup: VoteMatchupPayload | null;
  lastWinners: StoredWinnerPayload[];
  callerVoteState: {
    voted: number; // this cycle
    cap: number;
    hitCap: boolean;
  };
}

export interface CastVoteResponseData {
  ok: boolean;
  monster: {
    monsterId: string;
    wins: number;
    shown: number;
  };
  next: VoteMatchupPayload | null;
  callerVoteState: { voted: number; cap: number; hitCap: boolean };
}

export interface SectionRecordSummary {
  contributorProfileId: string;
  contributorDisplayName: string;
  submittedAt: number;
  nameToken: string;
  sectionImageUrl?: string;
}

/** Return shape of `GET /api/main-app`. Client passes this to state. */
export interface MainAppResponseData {
  visitor: VisitorSummary;
  weeklyVotingEnabled: boolean;
  monsters: MonsterIndexEntry[];
  currentSubmissionWindow: SubmissionWindow;
  currentVoteCycle: VoteCycle | null;
  storedWinners: StoredWinner[];
  banners: BannerBundle;
  /** Pending win banners (all of them, oldest first) — used for analytics + backup surface. */
  pendingWinBanners: Array<WinBannerPayload>;
  pendingCompletionBanners: Array<CompletionBannerPayload>;
  /** Caller's live section-lock, if any. Drives Builder resume + Create-tab CTA. */
  activeDraft?: ActiveDraftSummary;
  latestAward?: AwardRibbon;
}
