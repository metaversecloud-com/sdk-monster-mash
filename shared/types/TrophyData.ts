/**
 * Root shape for the Trophy dropped-asset dataObject.
 * Cached leaderboard so the drawer can render without scanning every monster
 * asset — the source of truth is the roster + per-monster awards, but this
 * cache is what the drawer reads and admin reset writes.
 */
export interface TrophyDataObject {
  schemaVersion: 1;
  leaderboard: {
    [profileId: string]: {
      displayName: string;
      awardsWon: number;
      monstersContributedTo: number;
      lastActivityAt: number;
    };
  };
}
