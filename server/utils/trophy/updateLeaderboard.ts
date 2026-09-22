import { KeyAssetDataObject, StoredWinner } from "@shared/types/index.js";

interface UpdateInput {
  currentLeaderboard: KeyAssetDataObject["trophyLeaderboard"];
  monsters: KeyAssetDataObject["monsters"];
  freshlyCrowned: StoredWinner[];
}

/**
 * PURE. Given the current trophyLeaderboard + a batch of freshly-crowned
 * winners, returns the next leaderboard state. The caller is responsible
 * for persisting it — this util does not write.
 *
 *   - Each contributor of a winning monster gets +1 award.
 *   - `monstersContributedTo` = distinct monsters this profile has any
 *     section on (recomputed from the current roster snapshot).
 */
export const computeLeaderboardForWinners = ({
  currentLeaderboard,
  monsters,
  freshlyCrowned,
}: UpdateInput): NonNullable<KeyAssetDataObject["trophyLeaderboard"]> => {
  const nextBoard: NonNullable<KeyAssetDataObject["trophyLeaderboard"]> = { ...(currentLeaderboard ?? {}) };
  const now = Date.now();
  for (const winner of freshlyCrowned) {
    for (const profileId of winner.contributorProfileIds ?? []) {
      const row = nextBoard[profileId] ?? {
        displayName: "",
        awardsWon: 0,
        monstersContributedTo: 0,
        lastActivityAt: 0,
      };
      row.awardsWon += 1;
      row.lastActivityAt = now;
      nextBoard[profileId] = row;
    }
  }

  // `monstersContributedTo` — count distinct monsters per profile from roster.
  const contributionCount = new Map<string, number>();
  const displayNameByProfile = new Map<string, string>();
  for (const entry of Object.values(monsters ?? {})) {
    if (!entry) continue;
    for (const profileId of entry.contributorProfileIds ?? []) {
      contributionCount.set(profileId, (contributionCount.get(profileId) ?? 0) + 1);
    }
    for (const s of ["head", "torso", "legs"] as const) {
      const slot = entry.sections?.[s];
      if (slot?.contributorProfileId && slot.contributorDisplayName) {
        displayNameByProfile.set(slot.contributorProfileId, slot.contributorDisplayName);
      }
    }
  }
  for (const [profileId, count] of contributionCount) {
    const row = nextBoard[profileId] ?? {
      displayName: "",
      awardsWon: 0,
      monstersContributedTo: 0,
      lastActivityAt: 0,
    };
    row.monstersContributedTo = count;
    const displayName = displayNameByProfile.get(profileId);
    if (displayName) row.displayName = displayName;
    nextBoard[profileId] = row;
  }
  return nextBoard;
};
