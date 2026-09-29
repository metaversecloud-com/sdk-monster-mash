import { MonsterIndexEntry } from "@shared/types/index";
import { contributorDisplayNamesFromEntry } from "../utils/monsters/contributorDisplayNames";

const baseComplete = (extras: Partial<MonsterIndexEntry> = {}): MonsterIndexEntry => ({
  monsterId: "m",
  state: "complete",
  contributorProfileIds: ["p1", "p2", "p3"],
  ...extras,
});

const baseInProgress = (extras: Partial<MonsterIndexEntry> = {}): MonsterIndexEntry => ({
  monsterId: "m",
  state: "in-progress",
  createdAt: 1,
  lastEditedAt: 1,
  contributorProfileIds: [],
  sections: {
    head: { status: "available" },
    torso: { status: "available" },
    legs: { status: "available" },
  },
  ...extras,
});

describe("contributorDisplayNamesFromEntry", () => {
  test("complete monsters: splits pipe-joined contributorNames in [head, torso, legs] order", () => {
    const entry = baseComplete({ contributorNames: "Lina B|Dina|Integrations" });
    expect(contributorDisplayNamesFromEntry(entry)).toEqual(["Lina B", "Dina", "Integrations"]);
  });

  test("complete monsters: drops empty segments from a partial contributorNames string", () => {
    const entry = baseComplete({ contributorNames: "Lina B||Integrations" });
    expect(contributorDisplayNamesFromEntry(entry)).toEqual(["Lina B", "Integrations"]);
  });

  test("in-progress monsters: reads from sections[s].contributorDisplayName", () => {
    const entry = baseInProgress({
      sections: {
        head: { status: "done", contributorProfileId: "p1", contributorDisplayName: "Alice", submittedAt: 1 },
        torso: { status: "locked", contributorProfileId: "p2", contributorDisplayName: "Bob", lockedAt: 2 },
        legs: { status: "available" },
      },
    });
    expect(contributorDisplayNamesFromEntry(entry)).toEqual(["Alice", "Bob"]);
  });

  test("returns [] when neither source is populated", () => {
    const entry = baseComplete();
    expect(contributorDisplayNamesFromEntry(entry)).toEqual([]);
  });
});
