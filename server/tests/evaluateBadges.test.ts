import { BadgeDef, parseBadgeDef, sortBadgeDefs } from "@shared/content/badges.js";
import { VOTING_CATEGORIES } from "@shared/content/monsterMash.js";
import { evaluateBadges } from "@utils/badges/evaluateBadges.js";

const def = (over: Partial<BadgeDef> & { name: string }): BadgeDef => ({
  displayName: over.name,
  group: "building",
  sortOrder: 0,
  thresholdKind: null,
  threshold: null,
  categoryId: null,
  sectionId: null,
  minVotesPerWeek: null,
  ...over,
});

const names = (badges: BadgeDef[]) => badges.map((b) => b.name).sort();

describe("parseBadgeDef", () => {
  test("reads a full rule off inventory metadata", () => {
    expect(
      parseBadgeDef("Master Builder", {
        displayName: "Master Builder",
        sortOrder: 37,
        group: "building",
        thresholdKind: "completeAsThird",
        threshold: 50,
        categoryId: null,
      }),
    ).toEqual({
      name: "Master Builder",
      displayName: "Master Builder",
      group: "building",
      sortOrder: 37,
      thresholdKind: "completeAsThird",
      threshold: 50,
      categoryId: null,
      sectionId: null,
      minVotesPerWeek: null,
    });
  });

  test("reads the qualifier fields the three qualified kinds need", () => {
    expect(
      parseBadgeDef("Brainstormer", { group: "building", thresholdKind: "submitSection", sectionId: "head" }),
    ).toMatchObject({ sectionId: "head" });
    expect(
      parseBadgeDef("Still Voting", { group: "voting", thresholdKind: "weeksWithMinVotes", minVotesPerWeek: 10 }),
    ).toMatchObject({ minVotesPerWeek: 10 });
    expect(
      parseBadgeDef("Winner: Silliest Monster", {
        group: "winning",
        thresholdKind: "winCategory",
        categoryId: "silliest",
      }),
    ).toMatchObject({ categoryId: "silliest" });
  });

  test("drops items with no/unknown group — not part of this app's grid", () => {
    expect(parseBadgeDef("Mystery", { group: "nonsense" })).toBeNull();
    expect(parseBadgeDef("Mystery", {})).toBeNull();
    expect(parseBadgeDef("", { group: "building" })).toBeNull();
  });

  test("bad thresholdKind or sectionId costs the rule, not the badge", () => {
    expect(parseBadgeDef("Odd", { group: "voting", thresholdKind: "bogus", threshold: 3 })).toMatchObject({
      group: "voting",
      thresholdKind: null,
    });
    expect(
      parseBadgeDef("Odd", { group: "building", thresholdKind: "submitSection", sectionId: "elbow" }),
    ).toMatchObject({ sectionId: null });
  });

  test("falls back to the item name and sorts unordered badges last", () => {
    const parsed = parseBadgeDef("Lab Partner", { group: "building" });
    expect(parsed?.displayName).toBe("Lab Partner");
    expect(sortBadgeDefs([parsed!, def({ name: "First", sortOrder: 1 })])[0].name).toBe("First");
  });
});

describe("evaluateBadges", () => {
  // Mirrors the shipped catalog's rules (Design Spec 1.2 → Badges (38)).
  const catalog: BadgeDef[] = [
    def({ name: "Mad Scientist", thresholdKind: "monstersStarted", threshold: 1 }),
    def({ name: "Really Mad Scientist", thresholdKind: "weeksStartedMonster", threshold: 2 }),
    def({ name: "Brainstormer", thresholdKind: "submitSection", threshold: 1, sectionId: "head" }),
    def({ name: "Body Builder", thresholdKind: "submitSection", threshold: 1, sectionId: "torso" }),
    def({ name: "Best Foot Forward", thresholdKind: "submitSection", threshold: 1, sectionId: "legs" }),
    def({ name: "Lab Partner", thresholdKind: "joinedMonster", threshold: 1 }),
    def({ name: "It's Alive!", thresholdKind: "completeAsThird", threshold: 1 }),
    def({ name: "Master Builder", thresholdKind: "completeAsThird", threshold: 50 }),
    def({ name: "I Voted!", group: "voting", thresholdKind: "vote", threshold: 1 }),
    def({ name: "Vote Monster", group: "voting", thresholdKind: "vote", threshold: 1000 }),
    def({ name: "Repeat Voter", group: "voting", thresholdKind: "weeksVoted", threshold: 3 }),
    def({ name: "Monster Judge", group: "voting", thresholdKind: "votesInSingleWeek", threshold: 10 }),
    def({ name: "Obsessed Voter", group: "voting", thresholdKind: "votesInSingleWeek", threshold: 40 }),
    def({
      name: "Still Voting",
      group: "voting",
      thresholdKind: "weeksWithMinVotes",
      threshold: 5,
      minVotesPerWeek: 10,
    }),
    def({ name: "New Masher", group: "visiting", thresholdKind: "visitAppOpens", threshold: 2 }),
    def({
      name: "Winner: Silliest Monster",
      group: "winning",
      thresholdKind: "winCategory",
      threshold: 1,
      categoryId: "silliest",
    }),
    def({ name: "Monster Hall of Fame", group: "winning", thresholdKind: "awardsWon", threshold: 5 }),
  ];

  test("grants at and above the threshold, not below", () => {
    expect(names(evaluateBadges(catalog, { completeAsThird: 49 }, new Set()))).toEqual(["It's Alive!"]);
    expect(names(evaluateBadges(catalog, { completeAsThird: 50 }, new Set()))).toEqual([
      "It's Alive!",
      "Master Builder",
    ]);
    expect(names(evaluateBadges(catalog, { completeAsThird: 0 }, new Set()))).toEqual([]);
  });

  test("each counter only drives its own badges", () => {
    expect(names(evaluateBadges(catalog, { monstersStarted: 1 }, new Set()))).toEqual(["Mad Scientist"]);
    expect(names(evaluateBadges(catalog, { weeksStartedMonster: 2 }, new Set()))).toEqual(["Really Mad Scientist"]);
    expect(names(evaluateBadges(catalog, { joinedMonster: 1 }, new Set()))).toEqual(["Lab Partner"]);
    expect(names(evaluateBadges(catalog, { visitAppOpens: 2 }, new Set()))).toEqual(["New Masher"]);
    expect(names(evaluateBadges(catalog, { awardsWon: 5 }, new Set()))).toEqual(["Monster Hall of Fame"]);
    expect(names(evaluateBadges(catalog, { vote: 1000 }, new Set()))).toEqual(["I Voted!", "Vote Monster"]);
  });

  test("submitSection only grants the badge for the section submitted", () => {
    expect(names(evaluateBadges(catalog, { sectionSubmits: { head: 1 } }, new Set()))).toEqual(["Brainstormer"]);
    expect(names(evaluateBadges(catalog, { sectionSubmits: { legs: 3 } }, new Set()))).toEqual(["Best Foot Forward"]);
    expect(names(evaluateBadges(catalog, { sectionSubmits: { head: 1, torso: 1, legs: 1 } }, new Set()))).toEqual([
      "Best Foot Forward",
      "Body Builder",
      "Brainstormer",
    ]);
  });

  test("votesInSingleWeek uses the player's best week", () => {
    expect(names(evaluateBadges(catalog, { votesInSingleWeek: 9 }, new Set()))).toEqual([]);
    expect(names(evaluateBadges(catalog, { votesInSingleWeek: 10 }, new Set()))).toEqual(["Monster Judge"]);
    expect(names(evaluateBadges(catalog, { votesInSingleWeek: 40 }, new Set()))).toEqual([
      "Monster Judge",
      "Obsessed Voter",
    ]);
  });

  test("weeksWithMinVotes counts only weeks clearing minVotesPerWeek", () => {
    // Four qualifying weeks (10+) is one short of the threshold of 5.
    expect(names(evaluateBadges(catalog, { votesPerWeek: [12, 10, 9, 40, 2, 11] }, new Set()))).toEqual([]);
    expect(names(evaluateBadges(catalog, { votesPerWeek: [12, 10, 9, 40, 2, 11, 10] }, new Set()))).toEqual([
      "Still Voting",
    ]);
    // Plenty of weeks, none big enough.
    expect(names(evaluateBadges(catalog, { votesPerWeek: [9, 9, 9, 9, 9, 9, 9, 9] }, new Set()))).toEqual([]);
  });

  test("winCategory grants on a win, and only for the category won", () => {
    expect(names(evaluateBadges(catalog, { wonCategories: new Set(["silliest"]) }, new Set()))).toEqual([
      "Winner: Silliest Monster",
    ]);
    expect(names(evaluateBadges(catalog, { wonCategories: new Set(["cutest"]) }, new Set()))).toEqual([]);
  });

  test("never re-grants an owned badge, but still grants newly-cleared ones", () => {
    const owned = new Set(["It's Alive!"]);
    expect(names(evaluateBadges(catalog, { completeAsThird: 50 }, owned))).toEqual(["Master Builder"]);
    expect(names(evaluateBadges(catalog, { completeAsThird: 50 }, new Set([...owned, "Master Builder"])))).toEqual([]);
  });

  test("a badge with an incomplete rule stays inert, however full the counters", () => {
    const full = {
      monstersStarted: 999,
      weeksStartedMonster: 999,
      joinedMonster: 999,
      completeAsThird: 999,
      vote: 9999,
      weeksVoted: 999,
      votesInSingleWeek: 999,
      votesPerWeek: Array(50).fill(99),
      visitAppOpens: 999,
      awardsWon: 999,
      sectionSubmits: { head: 9, torso: 9, legs: 9 },
      wonCategories: new Set(["silliest"]),
    };
    const inert: BadgeDef[] = [
      def({ name: "No kind" }),
      def({ name: "No threshold", thresholdKind: "completeAsThird", threshold: null }),
      def({ name: "No categoryId", group: "winning", thresholdKind: "winCategory", threshold: 1 }),
      def({ name: "No sectionId", thresholdKind: "submitSection", threshold: 1 }),
      def({ name: "No minVotes", group: "voting", thresholdKind: "weeksWithMinVotes", threshold: 1 }),
    ];
    expect(evaluateBadges(inert, full, new Set())).toEqual([]);
  });

  test("an empty catalog grants nothing (ecosystem unreachable must be inert)", () => {
    expect(evaluateBadges([], { vote: 9999, awardsWon: 999 }, new Set())).toEqual([]);
  });
});

describe("voting categories ↔ winCategory badges", () => {
  /**
   * The ACTIVE winner badges in the shipped ZIP. The eight "Possible for
   * future" categories ship INACTIVE, so they are deliberately absent here —
   * launching one means adding it to VOTING_CATEGORIES *and* flipping its
   * badge to ACTIVE. If these drift, a category win rewards nothing.
   */
  const ACTIVE_BADGE_CATEGORY_IDS = [
    "homework",
    "silliest",
    "best-dressed",
    "cutest",
    "strangest",
    "friendliest",
    "grumpiest",
  ];

  test("every live voting category has a matching ACTIVE winner badge", () => {
    expect([...VOTING_CATEGORIES.map((c) => c.id)].sort()).toEqual([...ACTIVE_BADGE_CATEGORY_IDS].sort());
  });
});
