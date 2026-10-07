import { KeyAssetDataObject } from "@shared/types/index.js";
import { FreshlyCrownedWinner } from "../vote/advanceWeeklyCycle.js";
import { formatLeaderboardRow, parseLeaderboardRow } from "./leaderboardRow.js";

interface UpdateInput {
  currentLeaderboard: KeyAssetDataObject["leaderboard"];
  monsters: KeyAssetDataObject["monsters"];
  freshlyCrowned: FreshlyCrownedWinner[];
}

/**
 * PURE. Given the current leaderboard + a batch of freshly-crowned
 * winners, returns the next leaderboard state. The caller is responsible
 * for persisting it — this util does not write.
 *
 *   - Each contributor of a winning monster gets +1 award.
 *   - `monstersContributedTo` = distinct monsters this profile has any
 *     section on (recomputed from the current roster snapshot).
 *
 * Rows are serialized to the compact pipe-joined form on the way out
 * (`"{displayName}|{awardsWon}|{monstersContributedTo}"`) — see
 * `KeyAssetDataObject.leaderboard` for the rationale.
 */
export const computeLeaderboardForWinners = ({
  currentLeaderboard,
  monsters,
  freshlyCrowned,
}: UpdateInput): NonNullable<KeyAssetDataObject["leaderboard"]> => {
  // Parse the existing compact rows into working objects so we can accumulate
  // award counts without constantly re-splitting the strings.
  const working = new Map<string, { displayName: string; awardsWon: number; monstersContributedTo: number }>();
  for (const [profileId, row] of Object.entries(currentLeaderboard ?? {})) {
    working.set(profileId, parseLeaderboardRow(row));
  }

  for (const winner of freshlyCrowned) {
    for (const profileId of winner.contributorProfileIds ?? []) {
      const row = working.get(profileId) ?? { displayName: "", awardsWon: 0, monstersContributedTo: 0 };
      row.awardsWon += 1;
      working.set(profileId, row);
    }
  }

  // `monstersContributedTo` — count distinct monsters per profile from roster.
  const contributionCount = new Map<string, number>();
  const displayNameByProfile = new Map<string, string>();
  for (const entry of Object.values(monsters ?? {})) {
    if (!entry) continue;
    const profileIds = entry.contributorProfileIds ?? [];
    for (const profileId of profileIds) {
      contributionCount.set(profileId, (contributionCount.get(profileId) ?? 0) + 1);
    }
    // Zip contributorProfileIds with the display-name source. Complete
    // monsters carry a pipe-joined `contributorNames` in matching order;
    // in-progress monsters still keep per-section identity on `sections`.
    if (entry.contributorNames) {
      const names = entry.contributorNames.split("|");
      for (let i = 0; i < profileIds.length; i++) {
        const name = names[i];
        if (profileIds[i] && name) displayNameByProfile.set(profileIds[i], name);
      }
    } else if (entry.sections) {
      for (const s of ["head", "torso", "legs"] as const) {
        const slot = entry.sections[s];
        if (slot?.contributorProfileId && slot.contributorDisplayName) {
          displayNameByProfile.set(slot.contributorProfileId, slot.contributorDisplayName);
        }
      }
    }
  }
  // `monstersContributedTo` is a fresh snapshot of the current roster — for
  // every profile we know about (either freshly crowned OR carried over from
  // the previous leaderboard), set the count to whatever the roster says
  // right now (0 if they're no longer on any monster). Without this, a
  // historical award-holder whose monsters have all been evicted or deleted
  // would show a stale "built" number forever.
  const seenProfiles = new Set<string>([...working.keys(), ...contributionCount.keys()]);
  for (const profileId of seenProfiles) {
    const row = working.get(profileId) ?? { displayName: "", awardsWon: 0, monstersContributedTo: 0 };
    row.monstersContributedTo = contributionCount.get(profileId) ?? 0;
    const displayName = displayNameByProfile.get(profileId);
    if (displayName) row.displayName = displayName;
    working.set(profileId, row);
  }

  // Serialize back to the compact storage shape.
  const nextBoard: NonNullable<KeyAssetDataObject["leaderboard"]> = {};
  for (const [profileId, row] of working) {
    nextBoard[profileId] = formatLeaderboardRow(row);
  }
  return nextBoard;
};
