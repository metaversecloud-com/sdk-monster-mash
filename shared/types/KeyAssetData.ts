import { Place, Section, SectionStatus } from "./SharedTypes.js";

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
   *
   * Awards stored on `storedWinners[monsterId]`
   */
  birthdate?: number;
  name?: string;
  imageUrl?: string;
  contributorProfileIds: string[];
  contributorNames?: string;

  /**
   * Lifetime count of matchups the monster has appeared in (sum of `shown`
   * from every vote cycle it was ever pooled into — tallies get wiped at
   * cycle close so we mirror the increment here on `handleCastVote`).
   * Drives the `advanceWeeklyCycle` backfill: when the previous week's
   * `eligibleMonsterIds` is short of `MIN_POOL_SIZE_FOR_VOTE`, we top up
   * from older complete monsters picked by (least-shown, newest-birthdate).
   */
  timesShown?: number;

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
  computedWinners?: Array<{ monsterId: string; place: Place }>;
}

/**
 * Minimal per-monster award record stored on the key asset. Keyed by
 * monsterId in `KeyAssetDataObject.storedWinners` — the monsterId is NOT a
 * field here, that's the key.
 *
 * Snapshots like `name` / `imageUrl` / `contributorProfileIds` are
 * intentionally NOT stored — they're read from `monsters[monsterId]` at
 * render time. If a winning monster is later admin-deleted, those fields
 * are simply absent in Last Week's Winners (no snapshot survives) — a
 * deliberate size trade: Firestore's 1 MiB document cap is tighter than
 * admins deleting winners is common.
 */
export interface StoredWinner {
  category: string;
  place: Place;
  awardedAt: number;
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
 * `storedWinners` is capped at `STORED_WINNERS_MAX` entries. Nothing here
 * grows unbounded.
 */
export interface KeyAssetDataObject {
  schemaVersion: 1;
  timezone: "America/New_York";

  weeklyVotingEnabled: boolean;

  monsters: { [monsterId: string]: MonsterIndexEntry };

  currentSubmissionWindow: SubmissionWindow;
  currentVoteCycle: VoteCycle | null;

  /**
   * Per-monster award record, keyed by monsterId. A monster appears here
   * exactly once (crowned monsters are excluded from future pools, so a
   * second win can't overwrite the first). Also serves as the exclusion
   * set for pool-building. Trimmed to `STORED_WINNERS_MAX` oldest-first.
   */
  storedWinners: { [monsterId: string]: StoredWinner };

  categorySchedule: CategorySchedule;

  /** Cached for pool-sizing heuristic on the following cycle. */
  lastCycleTotalVotes?: number;

  /**
   * Leaderboard cache. Lives on the key asset (not a separate Trophy
   * dropped asset) so the app doesn't need a second dropped asset placed by
   * world builders. The Trophy asset in the world is just a click target with
   * clickableLink → `?screen=trophy`.
   *
   * Each row is a pipe-joined string: `"{displayName}|{awardsWon}|{monstersContributedTo}"`.
   * Compact-string rows keep the per-doc size down at scale (worlds with many
   * contributors blow past Firestore's 1 MB soft limit fast otherwise). Use
   * `formatLeaderboardRow` / `parseLeaderboardRow` in `utils/trophy` to
   * read + write without hand-splitting.
   */
  leaderboard?: {
    [profileId: string]: string;
  };
}
