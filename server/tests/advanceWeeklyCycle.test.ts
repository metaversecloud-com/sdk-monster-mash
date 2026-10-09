import { KeyAssetDataObject } from "@shared/types/index";
import { MIN_POOL_SIZE_FOR_VOTE, WINNER_COOLDOWN_MS } from "@shared/content/monsterMash";
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
    storedWinners: {},
    categorySchedule: { nextIndex: 0 },
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

  test("carry-over drops monsters already crowned in storedWinners (within cooldown)", () => {
    const data = baseDataObject();
    const kept = ["a", "b"];
    const winner = "winner-x";
    for (const id of [...kept, winner]) data.monsters[id] = makeCompleteMonster(id) as any;
    data.currentSubmissionWindow!.eligibleMonsterIds = [...kept, winner];
    // awardedAt within the cooldown window → winner stays excluded.
    data.storedWinners = {
      [winner]: { category: "silliest", place: 1, awardedAt: NOW - 1_000 },
    };

    const { next } = advanceWeeklyCycle(data, NOW);

    expect(next.currentSubmissionWindow.eligibleMonsterIds).toEqual(kept);
  });

  test("past-cooldown winners re-enter the pool via backfill when needed", () => {
    const data = baseDataObject();
    const fresh = ["f1", "f2"];
    for (const id of fresh) data.monsters[id] = makeCompleteMonster(id, 100) as any;
    data.currentSubmissionWindow!.eligibleMonsterIds = [...fresh];

    // Winner whose award is well past the 30-day cooldown — should be
    // eligible to backfill into the new pool again.
    const oldWinner = "ancient-winner";
    data.monsters[oldWinner] = { ...makeCompleteMonster(oldWinner, 50), timesShown: 0 } as any;
    data.storedWinners = {
      [oldWinner]: { category: "silliest", place: 1, awardedAt: NOW - WINNER_COOLDOWN_MS - 1 },
    };

    // Enough other backfill candidates to reach MIN — the test specifically
    // asserts the old-winner is NOT filtered out as alreadyCrowned.
    for (let i = 0; i < MIN_POOL_SIZE_FOR_VOTE; i++) {
      const id = `backfill-${i}`;
      data.monsters[id] = { ...makeCompleteMonster(id, i), timesShown: 1 } as any;
    }

    const { next } = advanceWeeklyCycle(data, NOW);

    const pool = next.currentVoteCycle!.poolMonsterIds;
    // Fresh submissions still lead; the old winner shows up ahead of the
    // higher-timesShown backfill padding because it's zero-shown.
    expect(pool.slice(0, 2)).toEqual(fresh);
    expect(pool).toContain(oldWinner);
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

  test("backfills from older monsters when prevEligible is short, sorted by (fewest shown, newest birthdate)", () => {
    const data = baseDataObject();
    // No fresh submissions — force the pool to be entirely backfilled so we
    // can observe the sort order across more than one tie-break bucket. The
    // test still exercises the "fresh go first in the pool" ordering below
    // in a separate assertion.
    data.currentSubmissionWindow!.eligibleMonsterIds = [];

    // Four distinguishing candidates to assert the sort order on:
    //   1) `never-newer` (0 shown, birthdate 90) — top backfill pick
    //   2) `never-older` (0 shown, birthdate 10)
    //   3) `shown-once-newer` (1 shown, 80)
    //   4) `shown-once-older` (1 shown, 20)
    data.monsters["never-older"] = { ...makeCompleteMonster("never-older", 10), timesShown: 0 } as any;
    data.monsters["never-newer"] = { ...makeCompleteMonster("never-newer", 90), timesShown: 0 } as any;
    data.monsters["shown-once-older"] = { ...makeCompleteMonster("shown-once-older", 20), timesShown: 1 } as any;
    data.monsters["shown-once-newer"] = { ...makeCompleteMonster("shown-once-newer", 80), timesShown: 1 } as any;
    // Padding so the pool reaches MIN — these are the "lowest-priority"
    // candidates (highest timesShown), so they slot in AFTER the four
    // distinguishing picks above.
    const padCount = Math.max(0, MIN_POOL_SIZE_FOR_VOTE - 4);
    for (let i = 0; i < padCount; i++) {
      const id = `pad-${i}`;
      data.monsters[id] = { ...makeCompleteMonster(id, 5), timesShown: 99 } as any;
    }

    const { next } = advanceWeeklyCycle(data, NOW);

    expect(next.currentVoteCycle).not.toBeNull();
    const pool = next.currentVoteCycle!.poolMonsterIds;
    // Top 4 backfill picks follow the (shown asc, birthdate desc) sort.
    expect(pool.slice(0, 4)).toEqual(["never-newer", "never-older", "shown-once-newer", "shown-once-older"]);
    expect(pool.length).toBeGreaterThanOrEqual(MIN_POOL_SIZE_FOR_VOTE);
  });

  test("fresh submissions lead the pool, backfill appends behind them", () => {
    const data = baseDataObject();
    const fresh = ["fresh-a", "fresh-b"];
    for (const id of fresh) data.monsters[id] = makeCompleteMonster(id, 100) as any;
    data.currentSubmissionWindow!.eligibleMonsterIds = [...fresh];
    // Older zero-shown candidate — would otherwise sort before `fresh-*`
    // (both have no timesShown field), but the pool must keep the fresh
    // submissions in their original order up front and only use backfill
    // to pad up to MIN.
    const backfillId = "older-backfill";
    data.monsters[backfillId] = { ...makeCompleteMonster(backfillId, 50), timesShown: 0 } as any;
    // Padding so the pool reaches MIN.
    const padCount = Math.max(0, MIN_POOL_SIZE_FOR_VOTE - 3);
    for (let i = 0; i < padCount; i++) {
      const id = `pad-${i}`;
      data.monsters[id] = { ...makeCompleteMonster(id, 5), timesShown: 99 } as any;
    }

    const { next } = advanceWeeklyCycle(data, NOW);

    expect(next.currentVoteCycle).not.toBeNull();
    const pool = next.currentVoteCycle!.poolMonsterIds;
    expect(pool.slice(0, 2)).toEqual(fresh);
    expect(pool[2]).toBe(backfillId);
  });

  test("backfill skips winners (in storedWinners) and anything already in prevEligible", () => {
    const data = baseDataObject();
    const fresh = ["f1", "f2"];
    for (const id of fresh) data.monsters[id] = makeCompleteMonster(id, 100) as any;
    data.currentSubmissionWindow!.eligibleMonsterIds = [...fresh];

    const winner = "old-winner";
    data.monsters[winner] = { ...makeCompleteMonster(winner, 50), timesShown: 0 } as any;
    // Within cooldown — exclusion is still active for this test.
    data.storedWinners = {
      [winner]: { category: "silliest", place: 1, awardedAt: NOW - 1_000 },
    };

    // Enough non-winner backfill candidates to reach MIN comfortably.
    for (let i = 0; i < MIN_POOL_SIZE_FOR_VOTE; i++) {
      const id = `backfill-${i}`;
      data.monsters[id] = { ...makeCompleteMonster(id, i), timesShown: 0 } as any;
    }

    const { next } = advanceWeeklyCycle(data, NOW);

    const pool = next.currentVoteCycle!.poolMonsterIds;
    expect(pool).not.toContain(winner);
    // Fresh submissions kept, winner excluded, backfilled filler topped it off.
    expect(pool.slice(0, 2)).toEqual(fresh);
    expect(pool.length).toBe(MIN_POOL_SIZE_FOR_VOTE);
  });

  test("no cycle opens when even the backfilled pool is still short of MIN", () => {
    const data = baseDataObject();
    const fresh = ["f1", "f2"];
    for (const id of fresh) data.monsters[id] = makeCompleteMonster(id, 100) as any;
    data.currentSubmissionWindow!.eligibleMonsterIds = [...fresh];
    // Only one extra candidate — total 3, still below MIN.
    data.monsters["older"] = { ...makeCompleteMonster("older", 50), timesShown: 0 } as any;

    const { next } = advanceWeeklyCycle(data, NOW);

    expect(next.currentVoteCycle).toBeNull();
    // Fresh submissions carry forward; the backfill candidate stays on the
    // roster for next week's attempt without being shoved into the window.
    expect(next.currentSubmissionWindow.eligibleMonsterIds).toEqual(fresh);
  });
});
