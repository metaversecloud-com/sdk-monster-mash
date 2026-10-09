const topiaMock = require("../mocks/@rtsdk/topia").__mock;

import { MonsterMashVisitorData } from "@shared/types/index.js";
import { syncBadges } from "@utils/badges/syncBadges.js";
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

/**
 * The real shipped rules, as the inventory ZIP carries them. Kept whole so
 * this test fails if a rule stops being reachable through the full
 * catalog → counters → grant path.
 */
const CATALOG = [
  // building
  ["Mad Scientist", "building", 27, "monstersStarted", 1, {}],
  ["Really Mad Scientist", "building", 28, "weeksStartedMonster", 2, {}],
  ["Extremely Mad Scientist", "building", 29, "weeksStartedMonster", 5, {}],
  ["Brainstormer", "building", 30, "submitSection", 1, { sectionId: "head" }],
  ["Body Builder", "building", 31, "submitSection", 1, { sectionId: "torso" }],
  ["Best Foot Forward", "building", 32, "submitSection", 1, { sectionId: "legs" }],
  ["Lab Partner", "building", 33, "joinedMonster", 1, {}],
  ["It's Alive!", "building", 34, "completeAsThird", 1, {}],
  ["Spark of Life", "building", 35, "completeAsThird", 10, {}],
  ["Super Collaborator", "building", 36, "completeAsThird", 20, {}],
  ["Master Builder", "building", 37, "completeAsThird", 50, {}],
  // voting
  ["I Voted!", "voting", 16, "vote", 1, {}],
  ["Voting Enthusiast", "voting", 17, "weeksVoted", 10, {}],
  ["Obsessed Voter", "voting", 18, "votesInSingleWeek", 40, {}],
  ["Monster Judge", "voting", 19, "votesInSingleWeek", 10, {}],
  ["Still Voting", "voting", 20, "weeksWithMinVotes", 5, { minVotesPerWeek: 10 }],
  ["Vote Monster", "voting", 21, "vote", 1000, {}],
  ["Repeat Voter", "voting", 22, "weeksVoted", 3, {}],
  ["Voting Legend", "voting", 23, "weeksVoted", 20, {}],
  // visiting
  ["New Masher", "visiting", 24, "visitAppOpens", 2, {}],
  ["Elite Masher", "visiting", 25, "visitAppOpens", 5, {}],
  ["Legendary Masher", "visiting", 26, "visitAppOpens", 20, {}],
  // winning (launch categories only — the other 8 ship INACTIVE)
  ["Winner: Silliest Monster", "winning", 0, "winCategory", 1, { categoryId: "silliest" }],
  ["Winner: Cutest Monster", "winning", 5, "winCategory", 1, { categoryId: "cutest" }],
  ["Monster Hall of Fame", "winning", 15, "awardsWon", 5, {}],
] as const;

const setCatalog = (extra: any[] = []) =>
  topiaMock.setEcosystemInventory([
    ...CATALOG.map(([name, group, sortOrder, thresholdKind, threshold, qualifiers]) => ({
      id: `mm-${name}`,
      name,
      type: "BADGE",
      status: "ACTIVE",
      image_path: "https://cdn.example.com/a.png",
      metadata: { displayName: name, group, sortOrder, thresholdKind, threshold, ...(qualifiers as object) },
    })),
    ...extra,
  ]);

const makeVisitor = () => {
  const granted: string[] = [];
  const analyticsFired: Array<{ analyticName: string; uniqueKey?: string }> = [];
  return {
    granted,
    analyticsFired,
    // SDK contract: grantInventoryItem(itemInstance, quantity). The real
    // call passes the raw ecosystem inventory item (not an envelope with
    // inventoryItemId) — mock mirrors that so the test exercises the same
    // argument shape production hits.
    grantInventoryItem: jest.fn(async (item: any, _quantity: number) => {
      granted.push(String(item?.id ?? "").replace(/^mm-/, ""));
    }),
    // syncBadges fires one batched `badge_earned` analytic after a run that
    // granted anything — the mock collects them so tests can assert the
    // analytic path is wired without caring about the no-op data payload.
    updateDataObject: jest.fn(async (_patch: any, options: any) => {
      for (const a of options?.analytics ?? []) {
        analyticsFired.push({ analyticName: a.analyticName, uniqueKey: a.uniqueKey });
      }
    }),
  } as any;
};

const data = (over: Partial<MonsterMashVisitorData>): MonsterMashVisitorData => ({
  ...createEmptyVisitorData(),
  ...over,
});

beforeEach(() => {
  topiaMock.reset();
  clearInventoryCache();
});

describe("syncBadges", () => {
  test("a brand-new profile earns nothing", async () => {
    setCatalog();
    const visitor = makeVisitor();
    const granted = await syncBadges({
      credentials,
      visitor,
      visitorData: createEmptyVisitorData(),
      ownedBadgeNames: new Set(),
    });
    expect(granted).toEqual([]);
    expect(visitor.grantInventoryItem).not.toHaveBeenCalled();
  });

  test("grants every badge a full-career profile has earned, and no more", async () => {
    setCatalog();
    const visitor = makeVisitor();

    // 60 completed-as-third monsters across all three sections, one of
    // which was a join, plus 5 awards in two categories.
    const contributedMonsters: MonsterMashVisitorData["contributedMonsters"] = {};
    for (let i = 0; i < 60; i++) {
      contributedMonsters[`m${i}`] = {
        section: (["head", "torso", "legs"] as const)[i % 3],
        submittedAt: i,
        wasThirdSection: true,
        ...(i === 0 ? { joined: true } : {}),
      };
    }
    contributedMonsters.m0.awards = [
      { category: "silliest", place: 1, awardedAt: 1 },
      { category: "silliest", place: 2, awardedAt: 2 },
      { category: "cutest", place: 1, awardedAt: 3 },
      { category: "cutest", place: 3, awardedAt: 4 },
      { category: "silliest", place: 3, awardedAt: 5 },
    ];

    const granted = await syncBadges({
      credentials,
      visitor,
      visitorData: data({
        contributedMonsters,
        monstersStarted: 3,
        weeksStartedMonsterIn: ["w1", "w2"],
        daysAppOpened: Array.from({ length: 20 }, (_, i) => `2026-10-${i + 1}`),
        weeksVotedIn: Array.from({ length: 20 }, (_, i) => `w${i}`),
        totalVotesCast: 1000,
        votesByWeek: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`w${i}`, 50])),
      }),
      ownedBadgeNames: new Set(),
    });

    // Everything except Extremely Mad Scientist (needs 5 start-weeks, has 2).
    expect(granted.sort()).toEqual(
      [
        "Best Foot Forward",
        "Body Builder",
        "Brainstormer",
        "Elite Masher",
        "I Voted!",
        "It's Alive!",
        "Lab Partner",
        "Legendary Masher",
        "Mad Scientist",
        "Master Builder",
        "Monster Hall of Fame",
        "Monster Judge",
        "New Masher",
        "Obsessed Voter",
        "Really Mad Scientist",
        "Repeat Voter",
        "Spark of Life",
        "Still Voting",
        "Super Collaborator",
        "Vote Monster",
        "Voting Enthusiast",
        "Voting Legend",
        "Winner: Cutest Monster",
        "Winner: Silliest Monster",
      ].sort(),
    );
    expect(granted).not.toContain("Extremely Mad Scientist");
  });

  test("skips badges already owned", async () => {
    setCatalog();
    const visitor = makeVisitor();
    const granted = await syncBadges({
      credentials,
      visitor,
      visitorData: data({ totalVotesCast: 1, daysAppOpened: ["a", "b"] }),
      ownedBadgeNames: new Set(["I Voted!"]),
    });
    expect(granted).toEqual(["New Masher"]);
  });

  test("fires one `badge_earned` analytic per newly-granted badge in a single write", async () => {
    setCatalog();
    const visitor = makeVisitor();
    await syncBadges({
      credentials,
      // Minimum profile that still earns a couple of badges: 1 vote + 2 opens
      // → "I Voted!" + "New Masher".
      visitorData: data({ totalVotesCast: 1, daysAppOpened: ["a", "b"] }),
      visitor,
      ownedBadgeNames: new Set(),
    });
    // Exactly one updateDataObject call carrying both analytics (batched).
    expect(visitor.updateDataObject).toHaveBeenCalledTimes(1);
    expect(visitor.analyticsFired.map((a: any) => a.analyticName).sort()).toEqual(["badge_earned", "badge_earned"]);
    // uniqueKey is the profileId — dedup kicks in at the analytics layer, so
    // repeat grants on the same profile don't double-count.
    expect(visitor.analyticsFired.every((a: any) => a.uniqueKey === "profile-1")).toBe(true);
  });

  test("does not fire `badge_earned` when nothing new was granted", async () => {
    setCatalog();
    const visitor = makeVisitor();
    await syncBadges({
      credentials,
      visitor,
      visitorData: createEmptyVisitorData(),
      ownedBadgeNames: new Set(),
    });
    expect(visitor.updateDataObject).not.toHaveBeenCalled();
    expect(visitor.analyticsFired).toEqual([]);
  });

  test("an INACTIVE winner badge is never granted, even after winning that category", async () => {
    setCatalog([
      {
        id: "mm-Winner: Scariest Monster",
        name: "Winner: Scariest Monster",
        type: "BADGE",
        status: "INACTIVE",
        image_path: "",
        metadata: {
          displayName: "Winner: Scariest Monster",
          group: "winning",
          sortOrder: 8,
          thresholdKind: "winCategory",
          threshold: 1,
          categoryId: "scariest",
        },
      },
    ]);
    const visitor = makeVisitor();
    const granted = await syncBadges({
      credentials,
      visitor,
      visitorData: data({
        contributedMonsters: {
          m1: { section: "head", submittedAt: 1, awards: [{ category: "scariest", place: 1, awardedAt: 2 }] },
        },
      }),
      ownedBadgeNames: new Set(),
    });
    // The head submit still earns Brainstormer; the point is that winning
    // "scariest" earns nothing while that category's badge is INACTIVE.
    expect(granted).toEqual(["Brainstormer"]);
    expect(granted).not.toContain("Winner: Scariest Monster");
  });

  test("an unreachable ecosystem grants nothing rather than mis-granting", async () => {
    topiaMock.setEcosystemInventory([]);
    const visitor = makeVisitor();
    const granted = await syncBadges({
      credentials,
      visitor,
      visitorData: data({ totalVotesCast: 9999 }),
      ownedBadgeNames: new Set(),
    });
    expect(granted).toEqual([]);
    expect(visitor.grantInventoryItem).not.toHaveBeenCalled();
  });

  test("one failing grant doesn't block the rest", async () => {
    setCatalog();
    const visitor = makeVisitor();
    visitor.grantInventoryItem = jest.fn(async (item: any) => {
      if (item?.id === "mm-I Voted!") throw new Error("boom");
      visitor.granted.push(String(item?.id ?? "").replace(/^mm-/, ""));
    });

    const granted = await syncBadges({
      credentials,
      visitor,
      visitorData: data({ totalVotesCast: 1, daysAppOpened: ["a", "b"] }),
      ownedBadgeNames: new Set(),
    });
    expect(granted).toEqual(["New Masher"]);
  });
});
