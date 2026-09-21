import { AwardRibbon, Place, Section, SectionStatus } from "./SharedTypes.js";

export interface SectionRosterEntry {
  status: SectionStatus;
  contributorProfileId?: string;
  contributorDisplayName?: string;
  lockedAt?: number;
  submittedAt?: number;
}

/**
 * In-progress-only draft that lives on the key asset until the third section
 * lands. On completion these move onto the per-monster dropped asset.
 */
export interface InProgressSectionRecord {
  contributorProfileId: string;
  contributorDisplayName: string;
  submittedAt: number;
  parts: { [categoryId: string]: string };
  nameToken: string;
  sectionImageUrl?: string;
}

export interface MonsterIndexEntry {
  monsterId: string;
  monsterAssetId?: string;
  state: "in-progress" | "complete";
  createdAt: number;
  lastEditedAt: number;
  birthdate?: number;
  name?: string;
  imageUrl?: string;
  sections: Record<Section, SectionRosterEntry>;
  contributorProfileIds: string[];
  latestAward?: AwardRibbon;
  inProgressSections?: Partial<Record<Section, InProgressSectionRecord>>;
}

export interface SubmissionWindow {
  windowId: string;
  startAt: number;
  endAt: number;
  eligibleMonsterIds: string[];
}

export interface VoteCycle {
  cycleId: string;
  category: string;
  startAt: number;
  endAt: number;
  poolMonsterIds: string[];
  tallies: {
    [monsterId: string]: { shown: number; wins: number };
  };
  totalMatchupsServed: number;
  computedWinners?: Array<{ monsterId: string; place: Place }>;
}

export interface StoredWinner {
  monsterId: string;
  category: string;
  place: Place;
  awardedAt: number;
  contributorProfileIds: string[];
  snapshotName?: string;
  snapshotImageUrl?: string;
}

export interface CategorySchedule {
  orderIds: string[];
  nextIndex: number;
}

/**
 * Root shape for the Monster Mash key asset's dataObject.
 *
 * Scope: per-instance (one placement of the app in a world). Every field
 * below is bounded — the roster is capped at 100 in-progress + 200 finished,
 * storedWinners is capped at 10 weeks * 3 places = 30 entries. Nothing here
 * grows unbounded.
 */
export interface KeyAssetDataObject {
  schemaVersion: 1;
  timezone: "America/New_York";

  // Admin settings
  weeklyVotingEnabled: boolean;
  /** Optional override for the Info-sign asset image. Falls back to the bundled asset when null. */
  howToImageUrl?: string | null;

  monsters: { [monsterId: string]: MonsterIndexEntry };

  currentSubmissionWindow: SubmissionWindow;
  currentVoteCycle: VoteCycle | null;

  /** Rolling 30 (10 weeks × 3 places). Monsters in this list are ineligible for a new vote. */
  storedWinners: StoredWinner[];

  categorySchedule: CategorySchedule;

  /** Cached for pool-sizing heuristic on the following cycle. */
  lastCycleTotalVotes?: number;

  /**
   * Trophy leaderboard cache. Lives on the key asset (not a separate Trophy
   * dropped asset) so the app doesn't need a second dropped asset placed by
   * world builders. The Trophy asset in the world is just a click target with
   * clickableLink → `?screen=trophy`.
   */
  trophyLeaderboard?: {
    [profileId: string]: {
      displayName: string;
      awardsWon: number;
      monstersContributedTo: number;
      lastActivityAt: number;
    };
  };
}
