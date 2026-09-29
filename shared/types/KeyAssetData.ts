import { AwardRibbon, Place, Section, SectionStatus } from "./SharedTypes.js";

export interface SectionRosterEntry {
  status: SectionStatus;
  contributorProfileId?: string;
  contributorDisplayName?: string;
  lockedAt?: number;
  submittedAt?: number;
}

export interface MonsterIndexEntry {
  monsterId: string;
  monsterAssetId?: string;
  state: "in-progress" | "complete";

  /**
   * In-progress-only fields. Cleared at finalize so the completed roster
   * entry stays lean — Firestore per-doc size caps get real once the app
   * has been played for a few weeks and 200 finished monsters accumulate.
   *
   *   - `createdAt` / `lastEditedAt` are used for eldest-first eviction of
   *     IN-PROGRESS monsters and for stale-lock expiry sweeps. Completed
   *     monsters sort by `birthdate` instead (see `evictFinishedIfCapped`).
   *   - `sections` holds the per-slot state machine (available/locked/done +
   *     contributor identity). Once all three sections are done, we don't
   *     need the map anymore — display names are baked into
   *     `contributorNames`, and the section identity map lives on the
   *     dropped-monster asset (`MonsterAssetDataObject.sections`).
   */
  createdAt?: number;
  lastEditedAt?: number;
  sections?: Record<Section, SectionRosterEntry>;

  /**
   * Complete-only fields. Populated at finalize.
   *
   *   - `contributorNames` is a pipe-separated string in [head, torso, legs]
   *     order — same ordering as `contributorProfileIds`. Cheaper than a
   *     three-element array-of-strings once you multiply by 200 monsters.
   */
  birthdate?: number;
  name?: string;
  imageUrl?: string;
  contributorProfileIds: string[];
  contributorNames?: string;
  latestAward?: AwardRibbon;

  // NOTE: picks/nameToken per section live on each contributor's visitor
  // dataObject (`contributedDrafts[monsterId][section]`) — the roster
  // intentionally holds only identity, so this per-instance key asset
  // stays small at scale.
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
