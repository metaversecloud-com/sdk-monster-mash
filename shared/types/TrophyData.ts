/**
 * Root shape for the Trophy dropped-asset dataObject.
 * Cached leaderboard so the drawer can render without scanning every monster
 * asset — the source of truth is the roster + per-monster awards, but this
 * cache is what the drawer reads and admin reset writes.
 *
 * Rows use the same compact pipe-joined shape as
 * `KeyAssetDataObject.leaderboard` so both sites can share the same
 * `formatLeaderboardRow` / `parseLeaderboardRow` helpers.
 */
export interface TrophyDataObject {
  schemaVersion: 1;
  leaderboard: {
    [profileId: string]: string;
  };
}
