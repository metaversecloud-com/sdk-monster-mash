import { MonsterMashVisitorData } from "@shared/types/index.js";
import { computeVotedToday } from "../utils/vote/computeCallerVoteCounts";
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

describe("computeVotedToday", () => {
  test("same cycle + today → count carries forward", () => {
    const r = computeVotedToday(
      base({
        votesCastThisWeek: { windowId: "cycle-A", count: 5 },
        votesCastToday: { dateEt: TODAY_KEY, count: 3 },
      }),
      "cycle-A",
      NOW,
    );
    expect(r).toBe(3);
  });

  test("resets at midnight ET (cycle unchanged)", () => {
    const r = computeVotedToday(
      base({
        votesCastThisWeek: { windowId: "cycle-A", count: 5 },
        votesCastToday: { dateEt: "2026-10-05", count: 7 },
      }),
      "cycle-A",
      NOW,
    );
    expect(r).toBe(0);
  });

  test("resets on new cycleId even on the same ET day", () => {
    const r = computeVotedToday(
      base({
        votesCastThisWeek: { windowId: "cycle-A", count: 5 },
        // User maxed daily cap earlier today under cycle-A — admin
        // force-starts cycle-B, so today's counter zeros out.
        votesCastToday: { dateEt: TODAY_KEY, count: 10 },
      }),
      "cycle-B",
      NOW,
    );
    expect(r).toBe(0);
  });

  test("empty cycleId (no active vote) resets today's count", () => {
    const r = computeVotedToday(
      base({
        votesCastThisWeek: { windowId: "cycle-A", count: 5 },
        votesCastToday: { dateEt: TODAY_KEY, count: 3 },
      }),
      "",
      NOW,
    );
    expect(r).toBe(0);
  });

  test("missing counters default to 0 safely", () => {
    const r = computeVotedToday(base({ votesCastThisWeek: undefined, votesCastToday: undefined } as any), "cycle-A", NOW);
    expect(r).toBe(0);
  });
});
