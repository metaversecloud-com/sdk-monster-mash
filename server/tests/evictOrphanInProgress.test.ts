import { SECTION_LOCK_TTL_MS } from "@shared/content/monsterMash";
import { evictOrphanInProgressMonsters } from "../utils/monsters/evictOrphanInProgress";

const NOW = 1_800_000_000_000;
const AGED = NOW - SECTION_LOCK_TTL_MS - 1_000; // just past the grace window
const FRESH = NOW - 60_000; // 1 min old, well inside the grace window

const orphan = (id: string, anchor: number) =>
  ({
    monsterId: id,
    state: "in-progress" as const,
    createdAt: anchor,
    lastEditedAt: anchor,
    contributorProfileIds: [],
    sections: {
      head: { status: "available" as const },
      torso: { status: "available" as const },
      legs: { status: "available" as const },
    },
  }) as any;

describe("evictOrphanInProgressMonsters", () => {
  test("evicts in-progress monsters where all sections are available, no contributors, past the grace window", () => {
    const { monsters, changed, evictedIds } = evictOrphanInProgressMonsters(
      { "m-aged": orphan("m-aged", AGED) },
      NOW,
    );
    expect(changed).toBe(true);
    expect(evictedIds).toEqual(["m-aged"]);
    expect(monsters).toEqual({});
  });

  test("keeps freshly-created orphans inside the grace window (handles the create → claim race)", () => {
    const input = { "m-fresh": orphan("m-fresh", FRESH) };
    const { changed, monsters } = evictOrphanInProgressMonsters(input, NOW);
    expect(changed).toBe(false);
    expect(monsters).toEqual(input);
  });

  test("keeps monsters with ANY submitted contributor even if all slots show as available", () => {
    const withContributor = {
      ...orphan("m-contrib", AGED),
      contributorProfileIds: ["p1"],
    };
    const { changed } = evictOrphanInProgressMonsters({ "m-contrib": withContributor }, NOW);
    expect(changed).toBe(false);
  });

  test("keeps monsters where any section is still locked or done", () => {
    const partiallyLocked = {
      ...orphan("m-locked", AGED),
      sections: {
        head: { status: "locked" as const, contributorProfileId: "p1", lockedAt: AGED },
        torso: { status: "available" as const },
        legs: { status: "available" as const },
      },
    };
    const { changed } = evictOrphanInProgressMonsters({ "m-locked": partiallyLocked }, NOW);
    expect(changed).toBe(false);
  });

  test("leaves complete monsters alone", () => {
    const complete = {
      monsterId: "m-done",
      state: "complete" as const,
      birthdate: AGED,
      contributorProfileIds: ["p1", "p2", "p3"],
      contributorNames: "Alice|Bob|Carol",
    } as any;
    const input = { "m-done": complete };
    const { changed, monsters } = evictOrphanInProgressMonsters(input, NOW);
    expect(changed).toBe(false);
    expect(monsters).toEqual(input);
  });

  test("mixed input returns a new map with only the orphans removed", () => {
    const input = {
      "m-fresh": orphan("m-fresh", FRESH),
      "m-aged-1": orphan("m-aged-1", AGED),
      "m-aged-2": orphan("m-aged-2", AGED - 1_000),
      "m-contrib": { ...orphan("m-contrib", AGED), contributorProfileIds: ["p1"] },
    };
    const { changed, evictedIds, monsters } = evictOrphanInProgressMonsters(input, NOW);
    expect(changed).toBe(true);
    expect(new Set(evictedIds)).toEqual(new Set(["m-aged-1", "m-aged-2"]));
    expect(Object.keys(monsters).sort()).toEqual(["m-contrib", "m-fresh"]);
  });
});
