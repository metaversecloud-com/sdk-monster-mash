const topiaMock = require("../mocks/@rtsdk/topia").__mock;

import { MonsterMashVisitorData } from "@shared/types/index.js";
import { buildBadgeCounters } from "@utils/badges/buildBadgeCounters.js";
import { getBadgeCatalog } from "@utils/badges/getBadgeCatalog.js";
import { clearInventoryCache } from "@utils/inventoryCache.js";
import { createEmptyVisitorData } from "@utils/getVisitor.js";

const credentials = {
  assetId: "asset-123",
  interactivePublicKey: "key",
  interactiveNonce: "nonce",
  visitorId: 1,
  urlSlug: "my-world",
  sceneDropId: "scene-abc",
  profileId: "profile-1",
} as any;

/** An ecosystem inventory row as the SDK hands it back (flat, snake_case). */
const item = (over: Record<string, any> = {}) => ({
  id: `item-${over.name ?? "x"}`,
  name: "Some Badge",
  type: "BADGE",
  status: "ACTIVE",
  image_path: "https://cdn.example.com/a.png",
  metadata: { group: "building", sortOrder: 0, thresholdKind: "monstersStarted", threshold: 1 },
  ...over,
});

beforeEach(() => {
  topiaMock.reset();
  clearInventoryCache();
});

describe("getBadgeCatalog", () => {
  test("drops INACTIVE items at the cache layer", async () => {
    topiaMock.setEcosystemInventory([
      item({ name: "Mad Scientist" }),
      item({
        name: "Winner: Scariest Monster",
        status: "INACTIVE",
        metadata: {
          group: "winning",
          sortOrder: 8,
          thresholdKind: "winCategory",
          threshold: 1,
          categoryId: "scariest",
        },
      }),
    ]);

    const catalog = await getBadgeCatalog(credentials);
    expect(catalog.map((b) => b.name)).toEqual(["Mad Scientist"]);
  });

  test("keeps non-BADGE and unparseable rows out of the grid", async () => {
    topiaMock.setEcosystemInventory([
      item({ name: "Mad Scientist" }),
      item({ name: "Coins", type: "CURRENCY" }),
      item({ name: "Foreign Badge", metadata: { group: "not-a-group" } }),
      item({ name: "No Metadata", metadata: null }),
    ]);

    const catalog = await getBadgeCatalog(credentials);
    expect(catalog.map((b) => b.name)).toEqual(["Mad Scientist"]);
  });

  test("returns the catalog in sortOrder with id + art attached", async () => {
    topiaMock.setEcosystemInventory([
      item({
        name: "Master Builder",
        metadata: { group: "building", sortOrder: 37, thresholdKind: "completeAsThird", threshold: 50 },
      }),
      item({
        name: "Mad Scientist",
        metadata: { group: "building", sortOrder: 27, thresholdKind: "monstersStarted", threshold: 1 },
      }),
    ]);

    const catalog = await getBadgeCatalog(credentials);
    expect(catalog.map((b) => b.name)).toEqual(["Mad Scientist", "Master Builder"]);
    expect(catalog[0]).toMatchObject({ id: "item-Mad Scientist", iconUrl: "https://cdn.example.com/a.png" });
  });

  test("caches across calls, and forceRefresh refetches", async () => {
    topiaMock.setEcosystemInventory([item({ name: "Mad Scientist" })]);
    await getBadgeCatalog(credentials);
    await getBadgeCatalog(credentials);
    expect(topiaMock.ecosystemFetchInventorySpy).toHaveBeenCalledTimes(1);

    await getBadgeCatalog(credentials, { forceRefresh: true });
    expect(topiaMock.ecosystemFetchInventorySpy).toHaveBeenCalledTimes(2);
  });

  test("an empty ecosystem yields an empty catalog, not a throw", async () => {
    topiaMock.setEcosystemInventory([]);
    await expect(getBadgeCatalog(credentials)).resolves.toEqual([]);
  });
});

describe("buildBadgeCounters", () => {
  const withData = (over: Partial<MonsterMashVisitorData>): MonsterMashVisitorData => ({
    ...createEmptyVisitorData(),
    ...over,
  });

  test("derives section / join / third-section / award counters from contributedMonsters", () => {
    const counters = buildBadgeCounters(
      withData({
        contributedMonsters: {
          m1: { section: "head", submittedAt: 1, joined: true, wasThirdSection: true },
          m2: { section: "head", submittedAt: 2 },
          m3: { section: "legs", submittedAt: 3, joined: true },
          m4: {
            section: "torso",
            submittedAt: 4,
            awards: [
              { category: "silliest", place: 1, awardedAt: 5 },
              { category: "cutest", place: 2, awardedAt: 6 },
            ],
          },
        },
      }),
    );

    expect(counters.sectionSubmits).toEqual({ head: 2, legs: 1, torso: 1 });
    expect(counters.joinedMonster).toBe(2);
    expect(counters.completeAsThird).toBe(1);
    expect(counters.awardsWon).toBe(2);
    expect(counters.wonCategories).toEqual(new Set(["silliest", "cutest"]));
  });

  test("reads the stored start / vote / visit tallies", () => {
    const counters = buildBadgeCounters(
      withData({
        monstersStarted: 4,
        weeksStartedMonsterIn: ["w1", "w2"],
        daysAppOpened: ["2026-10-01", "2026-10-02", "2026-10-03"],
        weeksVotedIn: ["w1", "w2", "w3"],
        totalVotesCast: 42,
        votesByWeek: { w1: 12, w2: 3, w3: 40 },
      } as any),
    );

    expect(counters.monstersStarted).toBe(4);
    expect(counters.weeksStartedMonster).toBe(2);
    expect(counters.visitAppOpens).toBe(3);
    expect(counters.weeksVoted).toBe(3);
    expect(counters.vote).toBe(42);
    expect(counters.votesInSingleWeek).toBe(40);
    expect(counters.votesPerWeek).toEqual([12, 3, 40]);
  });

  test("an untouched profile counts zero everywhere", () => {
    const counters = buildBadgeCounters(createEmptyVisitorData());
    expect(counters).toMatchObject({
      monstersStarted: 0,
      weeksStartedMonster: 0,
      joinedMonster: 0,
      completeAsThird: 0,
      vote: 0,
      weeksVoted: 0,
      votesInSingleWeek: 0,
      visitAppOpens: 0,
      awardsWon: 0,
    });
    expect(counters.sectionSubmits).toEqual({});
    expect(counters.votesPerWeek).toEqual([]);
    expect(counters.wonCategories?.size).toBe(0);
  });
});
