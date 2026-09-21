import { DroppedAssetInterface } from "@rtsdk/topia";
import { KeyAssetDataObject, StoredWinner } from "@shared/types/index.js";

interface UpdateInput {
  monsters: KeyAssetDataObject["monsters"];
  freshlyCrowned: StoredWinner[];
}

/**
 * Apply a batch of freshly-crowned winners to `keyAsset.dataObject.trophyLeaderboard`.
 *   - Each contributor of a winning monster gets +1 award.
 *   - `monstersContributedTo` = distinct monsters this profile has any
 *     section on (recomputed from the current roster snapshot).
 */
export const updateLeaderboardForWinners = async (
  keyAsset: DroppedAssetInterface,
  { monsters, freshlyCrowned }: UpdateInput,
) => {
  const dataObject = keyAsset.dataObject as KeyAssetDataObject;
  const current = dataObject.trophyLeaderboard ?? {};

  // Award counters: bump 1 per contributor of each freshly-crowned monster.
  const nextBoard: NonNullable<KeyAssetDataObject["trophyLeaderboard"]> = { ...current };
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

  await keyAsset.updateDataObject({ trophyLeaderboard: nextBoard }, {});
};
