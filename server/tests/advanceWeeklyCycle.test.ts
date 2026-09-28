import { KeyAssetDataObject } from "@shared/types/index";
import { MIN_POOL_SIZE_FOR_VOTE } from "@shared/content/monsterMash";
import { advanceWeeklyCycle } from "../utils/vote/advanceWeeklyCycle";

// A "now" that lives outside the seeded windowIds so `advanceWeeklyCycle`
// treats the seed as stale and rolls forward.
const NOW = Date.UTC(2026, 8, 27, 12, 0, 0); // Sun Sep 27 2026 12:00 UTC

const makeCompleteMonster = (id: string, birthdate = 1) => ({
  monsterId: id,
  state: "complete" as const,
  createdAt: birthdate,
  lastEditedAt: birthdate,
  birthdate,
  name: id,
  imageUrl: `https://ex/${id}.png`,
  sections: {
    head: { status: "done" as const, contributorProfileId: "p1", submittedAt: birthdate },
    torso: { status: "done" as const, contributorProfileId: "p2", submittedAt: birthdate },
    legs: { status: "done" as const, contributorProfileId: "p3", submittedAt: birthdate },
  },
  contributorProfileIds: ["p1", "p2", "p3"] as string[],
});

const baseDataObject = (): KeyAssetDataObject =>
  ({
    schemaVersion: 1,
    timezone: "America/New_York",
    weeklyVotingEnabled: true,
    monsters: {},
    currentSubmissionWindow: {
      windowId: "STALE",
      startAt: 0,
      endAt: 0,
      eligibleMonsterIds: [],
    },
    currentVoteCycle: null,
    storedWinners: [],
    categorySchedule: { orderIds: ["silliest", "cutest"], nextIndex: 0 },
  }) as unknown as KeyAssetDataObject;

describe("advanceWeeklyCycle", () => {
  test("carries prevEligible into the new submission window when the pool is short of MIN", () => {
    const data = baseDataObject();
    const ids = ["a", "b", "c"];
    for (const id of ids) data.monsters[id] = makeCompleteMonster(id) as any;
    data.currentSubmissionWindow!.eligibleMonsterIds = ids;

    const { next, changed } = advanceWeeklyCycle(data, NOW);

    expect(changed).toBe(true);
    // No cycle opens (short of MIN)…
    expect(next.currentVoteCycle).toBeNull();
    // …and the previous week's monsters roll forward instead of disappearing.
    expect(next.currentSubmissionWindow.eligibleMonsterIds).toEqual(ids);
  });

  test("does NOT carry over when a fresh cycle opens (prevEligible fills the new pool)", () => {
    const data = baseDataObject();
    const ids = Array.from({ length: MIN_POOL_SIZE_FOR_VOTE }, (_, i) => `m${i}`);
    for (const id of ids) data.monsters[id] = makeCompleteMonster(id) as any;
    data.currentSubmissionWindow!.eligibleMonsterIds = ids;

    const { next } = advanceWeeklyCycle(data, NOW);

    expect(next.currentVoteCycle).not.toBeNull();
    expect(next.currentVoteCycle!.poolMonsterIds).toEqual(ids);
    // Eligible list starts empty — the pool that just opened owns those ids now.
    expect(next.currentSubmissionWindow.eligibleMonsterIds).toEqual([]);
  });

  test("carry-over drops monsters already crowned in storedWinners", () => {
    const data = baseDataObject();
    const kept = ["a", "b"];
    const winner = "winner-x";
    for (const id of [...kept, winner]) data.monsters[id] = makeCompleteMonster(id) as any;
    data.currentSubmissionWindow!.eligibleMonsterIds = [...kept, winner];
    data.storedWinners = [
      {
        monsterId: winner,
        category: "silliest",
        place: 1,
        awardedAt: 1,
        contributorProfileIds: ["p1"],
      },
    ];

    const { next } = advanceWeeklyCycle(data, NOW);

    expect(next.currentSubmissionWindow.eligibleMonsterIds).toEqual(kept);
  });

  test("carry-over drops monsters no longer on the roster (admin deleted or evicted)", () => {
    const data = baseDataObject();
    const kept = ["a"];
    for (const id of kept) data.monsters[id] = makeCompleteMonster(id) as any;
    // "ghost" is in the eligible list but no longer in the monsters roster
    // (mirrors the admin-delete cleanup that flushes the roster entry).
    data.currentSubmissionWindow!.eligibleMonsterIds = [...kept, "ghost"];

    const { next } = advanceWeeklyCycle(data, NOW);

    expect(next.currentSubmissionWindow.eligibleMonsterIds).toEqual(kept);
  });
});
