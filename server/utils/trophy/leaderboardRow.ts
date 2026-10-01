/**
 * The leaderboard rows on both `KeyAssetDataObject.leaderboard` and
 * `TrophyDataObject.leaderboard` are stored as pipe-joined strings
 * (`"{displayName}|{awardsWon}|{monstersContributedTo}"`) rather than
 * three-key objects — a per-doc size optimization once a world accumulates
 * many contributors.
 *
 * `format` writes the compact form; `parse` recovers the structured shape.
 * Display names cannot contain `|` for this reason — the format helper
 * strips them defensively so a stray pipe can't corrupt the row.
 */

export interface LeaderboardRowFields {
  displayName: string;
  awardsWon: number;
  monstersContributedTo: number;
}

/** Encode a row for storage. Strips `|` from the display name. */
export const formatLeaderboardRow = ({
  displayName,
  awardsWon,
  monstersContributedTo,
}: LeaderboardRowFields): string => {
  const safeName = (displayName ?? "").replace(/\|/g, "");
  return `${safeName}|${awardsWon}|${monstersContributedTo}`;
};

/**
 * Decode a stored row. Missing/malformed segments fall back to zeroes so
 * downstream sorts/renders never NaN. `displayName` is whatever precedes
 * the first `|` so legacy rows (which stored object JSON) collapse to a
 * blank-counter row instead of throwing.
 */
export const parseLeaderboardRow = (row: string | undefined | null): LeaderboardRowFields => {
  if (!row || typeof row !== "string") {
    return { displayName: "", awardsWon: 0, monstersContributedTo: 0 };
  }
  const parts = row.split("|");
  const displayName = parts[0] ?? "";
  const awardsWon = Number(parts[1]);
  const monstersContributedTo = Number(parts[2]);
  return {
    displayName,
    awardsWon: Number.isFinite(awardsWon) ? awardsWon : 0,
    monstersContributedTo: Number.isFinite(monstersContributedTo) ? monstersContributedTo : 0,
  };
};
