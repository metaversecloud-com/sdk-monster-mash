import { MonsterMashVisitorData } from "@shared/types/index.js";
import { computeCallerVoteCounts } from "../utils/vote/computeCallerVoteCounts";
import { etDateKey } from "../utils/vote/computeWindows";

const NOW = Date.UTC(2026, 9, 6, 20, 0, 0); // 2026-10-06 16:00 ET
const TODAY_KEY = etDateKey(NOW);

const base = (over: Partial<MonsterMashVisitorData> = {}): MonsterMashVisitorData =>
  ({
    schemaVersion: 1,
    dateStarted: 0,
    contributedMonsters: {},
    pendingWinBanners: [],
    pendingCompletionBanners: [],
    daysAppOpened: [],
    weeksVotedIn: [],
    votesCastThisWeek: { windowId: "", count: 0 },
    votesCastToday: { dateEt: "", count: 0 },
    totalVotesCast: 0,
    ...over,
  }) as MonsterMashVisitorData;

describe("computeCallerVoteCounts", () => {
  test("same cycle + today → counts carry forward", () => {
    const r = computeCallerVoteCounts(
      base({
        votesCastThisWeek: { windowId: "cycle-A", count: 5 },
        votesCastToday: { dateEt: TODAY_KEY, count: 3 },
      }),
      "cycle-A",
      NOW,
    );
    expect(r).toEqual({ votedToday: 3, votedCycle: 5 });
  });

  test("daily resets at midnight ET (cycle unchanged)", () => {
    const r = computeCallerVoteCounts(
      base({
        votesCastThisWeek: { windowId: "cycle-A", count: 5 },
        votesCastToday: { dateEt: "2026-10-05", count: 7 },
      }),
      "cycle-A",
      NOW,
    );
    expect(r).toEqual({ votedToday: 0, votedCycle: 5 });
  });

  test("new cycleId resets BOTH counters, even on the same ET day", () => {
    const r = computeCallerVoteCounts(
      base({
        votesCastThisWeek: { windowId: "cycle-A", count: 5 },
        // User maxed daily cap earlier today under cycle-A — the admin
        // force-starts cycle-B, so both counters should zero out.
        votesCastToday: { dateEt: TODAY_KEY, count: 10 },
      }),
      "cycle-B",
      NOW,
    );
    expect(r).toEqual({ votedToday: 0, votedCycle: 0 });
  });

  test("empty cycleId is treated like any other change (no active vote)", () => {
    const r = computeCallerVoteCounts(
      base({
        votesCastThisWeek: { windowId: "cycle-A", count: 5 },
        votesCastToday: { dateEt: TODAY_KEY, count: 3 },
      }),
      "",
      NOW,
    );
    expect(r).toEqual({ votedToday: 0, votedCycle: 0 });
  });

  test("missing counters default to 0 safely", () => {
    const r = computeCallerVoteCounts(base({ votesCastThisWeek: undefined, votesCastToday: undefined } as any), "cycle-A", NOW);
    expect(r).toEqual({ votedToday: 0, votedCycle: 0 });
  });
});
