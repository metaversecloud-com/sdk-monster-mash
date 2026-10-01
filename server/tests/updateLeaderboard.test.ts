import { KeyAssetDataObject, StoredWinner } from "@shared/types/index";
import { computeLeaderboardForWinners } from "../utils/trophy/updateLeaderboard";
import { parseLeaderboardRow } from "../utils/trophy/leaderboardRow";

const makeMonster = (
  id: string,
  profileIds: string[],
  contributorNames: string,
): KeyAssetDataObject["monsters"][string] => ({
  monsterId: id,
  state: "complete",
  birthdate: 1,
  name: `monster-${id}`,
  contributorProfileIds: profileIds,
  contributorNames,
});

const makeWinner = (monsterId: string, profileIds: string[], place: 1 | 2 | 3): StoredWinner => ({
  monsterId,
  category: "silliest",
  place,
  awardedAt: 123,
  contributorProfileIds: profileIds,
});

describe("computeLeaderboardForWinners", () => {
  test("produces one row per winning contributor, serialized as 'name|awards|built'", () => {
    const monsters = {
      "m-1": makeMonster("m-1", ["p1", "p2", "p3"], "Alice|Bob|Carol"),
    };
    const winners = [makeWinner("m-1", ["p1", "p2", "p3"], 1)];

    const next = computeLeaderboardForWinners({
      currentLeaderboard: undefined,
      monsters,
      freshlyCrowned: winners,
    });

    expect(Object.keys(next)).toHaveLength(3);
    expect(parseLeaderboardRow(next.p1)).toEqual({ displayName: "Alice", awardsWon: 1, monstersContributedTo: 1 });
    expect(parseLeaderboardRow(next.p2)).toEqual({ displayName: "Bob", awardsWon: 1, monstersContributedTo: 1 });
    expect(parseLeaderboardRow(next.p3)).toEqual({ displayName: "Carol", awardsWon: 1, monstersContributedTo: 1 });
  });

  test("accumulates onto an existing leaderboard rather than clobbering it", () => {
    const monsters = {
      "m-new": makeMonster("m-new", ["p1"], "Alice"),
    };
    const winners = [makeWinner("m-new", ["p1"], 2)];

    const next = computeLeaderboardForWinners({
      // p1 already has 3 wins from last week; p2 has 1 win and never contributed again.
      currentLeaderboard: { p1: "Alice|3|5", p2: "Bob|1|2" },
      monsters,
      freshlyCrowned: winners,
    });

    expect(parseLeaderboardRow(next.p1)).toEqual({ displayName: "Alice", awardsWon: 4, monstersContributedTo: 1 });
    // p2 keeps their historical award count (no new win) but monstersContributedTo
    // reflects CURRENT roster (which no longer has p2 on anything) — this is the
    // existing semantics: "built" is recomputed from the roster each time.
    expect(parseLeaderboardRow(next.p2)).toEqual({ displayName: "Bob", awardsWon: 1, monstersContributedTo: 0 });
  });

  test("counts a contributor's monsters even if they didn't win this round", () => {
    const monsters = {
      "m-1": makeMonster("m-1", ["p1", "p2"], "Alice|Bob"),
      "m-2": makeMonster("m-2", ["p1"], "Alice"),
      "m-3": makeMonster("m-3", ["p3"], "Carol"),
    };
    const winners = [makeWinner("m-1", ["p1", "p2"], 1)];

    const next = computeLeaderboardForWinners({
      currentLeaderboard: undefined,
      monsters,
      freshlyCrowned: winners,
    });

    expect(parseLeaderboardRow(next.p1)).toEqual({ displayName: "Alice", awardsWon: 1, monstersContributedTo: 2 });
    expect(parseLeaderboardRow(next.p2)).toEqual({ displayName: "Bob", awardsWon: 1, monstersContributedTo: 1 });
    // p3 contributed but didn't win — still appears with awardsWon=0.
    expect(parseLeaderboardRow(next.p3)).toEqual({ displayName: "Carol", awardsWon: 0, monstersContributedTo: 1 });
  });
});
