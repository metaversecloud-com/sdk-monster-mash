const topiaMock = require("../mocks/@rtsdk/topia").__mock;

import express from "express";
import request from "supertest";

import router from "../routes.js";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  return app;
}

const baseCreds = {
  assetId: "asset-123",
  interactivePublicKey: process.env.INTERACTIVE_KEY,
  interactiveNonce: "nonce-xyz",
  visitorId: 1,
  urlSlug: "my-world",
  sceneDropId: "scene-abc",
  profileId: "profile-1",
  displayName: "Alice",
  username: "alice",
};

const bobCreds = {
  ...baseCreds,
  visitorId: 2,
  profileId: "profile-2",
  displayName: "Bob",
  username: "bob",
};

const emptyVisitorData = {
  schemaVersion: 1,
  dateStarted: 1,
  contributedMonsters: {},
  pendingWinBanners: [],
  pendingCompletionBanners: [],
  daysAppOpened: [],
  weeksVotedIn: [],
  weeksSubmittedIn: [],
  weeksCreatedMonsterIn: [],
  votesCastThisWeek: { windowId: "", count: 0 },
  totalVotesCast: 0,
  totalThirdSectionCompletions: 0,
};

const HEAD_PICKS = {
  headShape: "pig-head",
  eyes: "cyclops-eye",
  nose: "NONE",
  mouth: "grin",
  hair: "NONE",
};
const TORSO_PICKS = {
  shirt: "hoodie",
  arms: "hoodie-arms",
  collar: "NONE",
  torsoBack: "NONE",
};
const LEGS_PICKS = {
  legs: "jeans",
  feet: "sneakers",
  belt: "NONE",
  waist: "NONE",
  legsBack: "NONE",
};

// Mock the app utils at the boundary so routes can be exercised without hitting @rtsdk/topia.
// Only mock what routes actually import — everything else can pass through.
// Mock the parts loader at its source so `validatePicks` (imported deeply)
// sees a stable catalog instead of walking the empty filesystem.
jest.mock("@utils/content/getContent.js", () => ({
  __esModule: true,
  getContent: jest.fn().mockImplementation(() => fakeContent()),
  refreshContent: jest.fn().mockImplementation(() => fakeContent()),
  buildClientPayload: jest.fn().mockImplementation(() => ({
    ...fakeContent(),
    categories: [],
    categoriesBySection: { head: [], torso: [], legs: [] },
    layerOrder: [],
  })),
}));

jest.mock("@utils/index.js", () => {
  const actual = jest.requireActual("@utils/index.js");
  return {
    ...actual,
    errorHandler: jest.fn(({ res }: any) => {
      if (res && !res.headersSent) res.status(500).send({ success: false, error: "test-error" });
      return {};
    }),
    getCredentials: jest.fn(),
    getKeyAsset: jest.fn(),
    getVisitor: jest.fn(),
    lockDataObject: jest.fn().mockResolvedValue(undefined),
    // Compositor + finalize surfaces: mocked so tests don't reach S3 or spin
    // up Jimp. Individual tests can override return values. Section image
    // upload was removed — only the full monster composes on finalize.
    composeAndUploadMonster: jest.fn().mockResolvedValue("https://example.com/monster.png"),
    // Real finalize builds a roster patch; the mock returns a patch that lets
    // handleSubmitSection merge state/name/monsterAssetId onto monster mon-triple
    // (the id used by the third-section test).
    finalizeMonster: jest.fn().mockImplementation(async ({ monsterId, entry }: any) => ({
      imageUrl: "https://example.com/monster.png",
      monsterAssetId: "dropped-monster-42",
      monsterAssetData: {},
      composedName: "Test Monster",
      keyAssetPatch: {
        monsters: {
          [monsterId]: {
            ...entry,
            state: "complete",
            birthdate: 12345,
            name: "Test Monster",
            monsterAssetId: "dropped-monster-42",
            imageUrl: "https://example.com/monster.png",
          },
        },
      },
      callerContribution: {
        monsterAssetId: "dropped-monster-42",
        imageUrl: "https://example.com/monster.png",
        completedAt: 12345,
      },
    })),
    // Epic-7 banner fanouts — no-ops in tests.
    enqueueWinBannersForProfiles: jest.fn().mockResolvedValue(undefined),
    enqueueCompletionBannersForProfiles: jest.fn().mockResolvedValue(undefined),
    computeLeaderboardForWinners: jest.fn().mockReturnValue({}),
    // Epic-6 pool builder — deterministic pair.
    pickMatchup: jest.fn().mockImplementation((cycle: any) => {
      const [a, b] = cycle.poolMonsterIds ?? [];
      if (!a || !b) return null;
      return { matchupId: `${cycle.cycleId}-${a}-${b}`, pair: [a, b] };
    }),
    // Content loader — return the parts the test picks reference so
    // validatePicks succeeds. Real prod loader walks client/public/parts.
    getContent: jest.fn().mockReturnValue(fakeContent()),
    refreshContent: jest.fn().mockReturnValue(fakeContent()),
    buildClientPayload: jest.fn().mockReturnValue({
      ...fakeContent(),
      categories: [],
      categoriesBySection: { head: [], torso: [], legs: [] },
      layerOrder: [],
    }),
  };
});

function fakeContent() {
  const rawParts = [
    { id: "pig-head", section: "head", categoryId: "headShape", imageName: "pig-head.png" },
    { id: "cyclops-eye", section: "head", categoryId: "eyes", imageName: "cyclops-eye.png" },
    { id: "grin", section: "head", categoryId: "mouth", imageName: "grin.png" },
    { id: "hoodie", section: "torso", categoryId: "shirt", imageName: "hoodie.png" },
    { id: "hoodie-arms", section: "torso", categoryId: "arms", imageName: "hoodie-arms.png" },
    { id: "jeans", section: "legs", categoryId: "legs", imageName: "jeans.png", supportsFeet: true },
    { id: "spring", section: "legs", categoryId: "legs", imageName: "spring.png", supportsFeet: false },
    { id: "sneakers", section: "legs", categoryId: "feet", imageName: "sneakers.png" },
  ];
  const partById: Record<string, any> = {};
  const partsByCategory: Record<string, any[]> = {};
  for (const p of rawParts) {
    partById[p.id] = p;
    partsByCategory[p.categoryId] = partsByCategory[p.categoryId] ?? [];
    partsByCategory[p.categoryId].push(p);
  }
  return {
    parts: rawParts,
    partById,
    partsByCategory,
    loadedAt: 0,
  };
}

const mockUtils = jest.mocked(require("@utils/index.js"));

// A stateful in-memory key-asset stand-in the tests can hand to `getKeyAsset`.
function makeKeyAsset(initialDataObject: any = {}) {
  const record: any = {
    id: "asset-123",
    dataObject: initialDataObject,
    fetchDataObject: jest.fn().mockImplementation(async () => record.dataObject),
    updateDataObject: jest.fn().mockImplementation(async (patch: any) => {
      record.dataObject = mergeDataObject(record.dataObject, patch);
      return record.dataObject;
    }),
    setDataObject: jest.fn().mockImplementation(async (payload: any) => {
      record.dataObject = payload;
      return record.dataObject;
    }),
  };
  return record;
}

/** Applies dot-notation patch keys the way the real SDK's updateDataObject does. */
function mergeDataObject(current: any, patch: any) {
  const next = { ...(current || {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (!key.includes(".")) {
      next[key] = value;
      continue;
    }
    const parts = key.split(".");
    let cursor = next;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      cursor[p] = { ...(cursor[p] || {}) };
      cursor = cursor[p];
    }
    cursor[parts[parts.length - 1]] = value;
  }
  return next;
}

function makeVisitor() {
  const record: any = {
    updateDataObject: jest.fn().mockResolvedValue({}),
    closeIframe: jest.fn().mockResolvedValue({}),
    openIframe: jest.fn().mockResolvedValue({}),
  };
  return record;
}

const defaultKeyAssetDataObject = (): any => ({
  schemaVersion: 1,
  timezone: "America/New_York",
  weeklyVotingEnabled: true,
  howToImageUrl: null,
  monsters: {} as any,
  currentSubmissionWindow: {
    windowId: "2026-09-13",
    startAt: 1_757_734_800_000,
    endAt: 1_758_335_999_000,
    eligibleMonsterIds: [] as string[],
  },
  currentVoteCycle: null as any,
  storedWinners: [],
  categorySchedule: { orderIds: ["silliest"], nextIndex: 0 },
});

describe("routes", () => {
  beforeEach(() => {
    topiaMock.reset();
    jest.clearAllMocks();
  });

  test("GET /system/health returns status OK and env keys", async () => {
    const app = makeApp();
    const res = await request(app).get("/api/system/health");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status", "OK");
    expect(res.body).toHaveProperty("envs");
    expect(res.body.envs).toHaveProperty("NODE_ENV");
  });

  test("GET /main-app returns visitor summary + empty roster on first open", async () => {
    const keyAsset = makeKeyAsset(defaultKeyAssetDataObject());

    mockUtils.getCredentials.mockReturnValue(baseCreds);
    mockUtils.getKeyAsset.mockResolvedValue(keyAsset);
    mockUtils.getVisitor.mockResolvedValue({
      visitor: makeVisitor(),
      isAdmin: true,
      visitorData: emptyVisitorData,
      visitorInventory: {},
    });

    const app = makeApp();
    const res = await request(app).get("/api/main-app").query(baseCreds as any);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      visitor: { isAdmin: true, visitorId: baseCreds.visitorId, profileId: baseCreds.profileId },
      weeklyVotingEnabled: true,
      monsters: [],
      currentVoteCycle: null,
      storedWinners: [],
    });
  });

  test("POST /monsters/start creates an in-progress monster + locks one section for caller", async () => {
    const keyAsset = makeKeyAsset(defaultKeyAssetDataObject());
    const visitor = makeVisitor();

    mockUtils.getCredentials.mockReturnValue(baseCreds);
    mockUtils.getKeyAsset.mockResolvedValue(keyAsset);
    mockUtils.getVisitor.mockResolvedValue({
      visitor,
      isAdmin: false,
      visitorData: emptyVisitorData,
      visitorInventory: {},
    });

    const app = makeApp();
    const res = await request(app).post("/api/monsters/start").send(baseCreds);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const { monsterId, section, monster } = res.body.data;
    expect(monsterId).toBeTruthy();
    expect(["head", "torso", "legs"]).toContain(section);
    expect(monster.state).toBe("in-progress");
    expect(monster.sections[section]).toMatchObject({
      status: "locked",
      contributorProfileId: baseCreds.profileId,
    });

    // The other two start `available`.
    const others = ["head", "torso", "legs"].filter((s) => s !== section);
    for (const s of others) expect(monster.sections[s].status).toBe("available");

    // Visitor received an activeDraft.
    expect(visitor.updateDataObject).toHaveBeenCalled();
    const visitorPayload = visitor.updateDataObject.mock.calls[0][0];
    const scoped = visitorPayload[`${baseCreds.urlSlug}-${baseCreds.sceneDropId}`];
    expect(scoped.activeDraft).toMatchObject({ monsterId, section });
  });

  test("POST /monsters/start refuses when the caller already has an activeDraft", async () => {
    const preExistingMonster = "existing-mon";
    const keyAssetData = defaultKeyAssetDataObject();
    keyAssetData.monsters = {
      [preExistingMonster]: {
        monsterId: preExistingMonster,
        state: "in-progress",
        createdAt: 1,
        lastEditedAt: 2,
        sections: {
          head: { status: "locked", contributorProfileId: baseCreds.profileId, lockedAt: Date.now() },
          torso: { status: "available" },
          legs: { status: "available" },
        },
        contributorProfileIds: [],
      },
    };
    mockUtils.getCredentials.mockReturnValue(baseCreds);
    mockUtils.getKeyAsset.mockResolvedValue(makeKeyAsset(keyAssetData));
    mockUtils.getVisitor.mockResolvedValue({
      visitor: makeVisitor(),
      isAdmin: false,
      visitorData: {
        ...emptyVisitorData,
        activeDraft: {
          monsterId: preExistingMonster,
          section: "head",
          lockedAt: Date.now(),
          lastActivityAt: Date.now(),
          picks: {},
        },
      },
      visitorInventory: {},
    });

    const app = makeApp();
    const res = await request(app).post("/api/monsters/start").send(baseCreds);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.activeDraft).toMatchObject({ monsterId: preExistingMonster });
  });

  test("POST /monsters/:id/claim: two concurrent claims → one 200, one 409", async () => {
    const monsterId = "mon-claim-race";
    const buildData = () => ({
      ...defaultKeyAssetDataObject(),
      monsters: {
        [monsterId]: {
          monsterId,
          state: "in-progress",
          createdAt: 1,
          lastEditedAt: 2,
          sections: {
            head: { status: "locked", contributorProfileId: "profile-9", lockedAt: Date.now() },
            torso: { status: "available" },
            legs: { status: "available" },
          },
          contributorProfileIds: ["profile-9"],
        },
      },
    });

    // First caller (Alice): claims torso → 200.
    const aliceKeyAsset = makeKeyAsset(buildData());
    mockUtils.getCredentials.mockReturnValueOnce(baseCreds);
    mockUtils.getKeyAsset.mockResolvedValueOnce(aliceKeyAsset);
    mockUtils.getVisitor.mockResolvedValueOnce({
      visitor: makeVisitor(),
      isAdmin: false,
      visitorData: emptyVisitorData,
      visitorInventory: {},
    });
    (mockUtils.lockDataObject as jest.Mock).mockResolvedValueOnce(undefined);

    const app = makeApp();
    let res = await request(app)
      .post(`/api/monsters/${monsterId}/claim`)
      .send({ ...baseCreds, section: "torso" });

    expect(res.status).toBe(200);
    expect(res.body.data.section).toBe("torso");

    // Second caller (Bob): tries same torso, lock throws → 409.
    const bobKeyAsset = makeKeyAsset(buildData());
    mockUtils.getCredentials.mockReturnValueOnce(bobCreds);
    mockUtils.getKeyAsset.mockResolvedValueOnce(bobKeyAsset);
    mockUtils.getVisitor.mockResolvedValueOnce({
      visitor: makeVisitor(),
      isAdmin: false,
      visitorData: emptyVisitorData,
      visitorInventory: {},
    });
    (mockUtils.lockDataObject as jest.Mock).mockRejectedValueOnce(new Error("lock contested"));

    res = await request(app)
      .post(`/api/monsters/${monsterId}/claim`)
      .send({ ...bobCreds, section: "torso" });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  test("POST /monsters/:id/section: submitting the third section flips state to complete + composes name", async () => {
    const monsterId = "mon-triple";
    const keyAssetData = defaultKeyAssetDataObject();
    keyAssetData.monsters = {
      [monsterId]: {
        monsterId,
        state: "in-progress",
        createdAt: 1,
        lastEditedAt: 2,
        sections: {
          head: {
            status: "done",
            contributorProfileId: "profile-9",
            contributorDisplayName: "Zed",
            submittedAt: 3,
          },
          torso: {
            status: "done",
            contributorProfileId: "profile-8",
            contributorDisplayName: "Yara",
            submittedAt: 4,
          },
          legs: {
            status: "locked",
            contributorProfileId: baseCreds.profileId,
            contributorDisplayName: baseCreds.displayName,
            lockedAt: 5,
          },
        },
        contributorProfileIds: ["profile-9", "profile-8"],
      },
    };

    const keyAsset = makeKeyAsset(keyAssetData);
    const visitor = makeVisitor();
    mockUtils.getCredentials.mockReturnValue(baseCreds);
    mockUtils.getKeyAsset.mockResolvedValue(keyAsset);
    mockUtils.getVisitor.mockResolvedValue({
      visitor,
      isAdmin: false,
      visitorData: {
        ...emptyVisitorData,
        activeDraft: {
          monsterId,
          section: "legs",
          lockedAt: 5,
          lastActivityAt: 5,
          picks: LEGS_PICKS,
          nameToken: "the Magnificent",
        },
      },
      visitorInventory: {},
    });

    const app = makeApp();
    const res = await request(app)
      .post(`/api/monsters/${monsterId}/section`)
      .send({
        ...baseCreds,
        section: "legs",
        picks: LEGS_PICKS,
        nameToken: "the Magnificent",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      monsterId,
      section: "legs",
      isComplete: true,
      composedName: "Test Monster",
      imageUrl: "https://example.com/monster.png",
      monsterAssetId: "dropped-monster-42",
    });

    // KeyAsset now has state=complete + composed name (from finalize's patch).
    expect(keyAsset.dataObject.monsters[monsterId].state).toBe("complete");
    expect(keyAsset.dataObject.monsters[monsterId].name).toBe("Test Monster");
    expect(keyAsset.dataObject.monsters[monsterId].sections.legs.status).toBe("done");

    // Finalize is called once with the caller's picks + nameToken and receives
    // the section that triggered completion. No per-section image compose.
    expect(mockUtils.finalizeMonster).toHaveBeenCalledTimes(1);
    expect(mockUtils.finalizeMonster).toHaveBeenCalledWith(
      expect.objectContaining({
        monsterId,
        callerSection: "legs",
        callerNameToken: "the Magnificent",
        clickableLinkBase: expect.any(String),
      }),
    );

    // Visitor: activeDraft cleared, contributedMonsters updated.
    const visitorPatch = visitor.updateDataObject.mock.calls[0][0];
    const scoped = visitorPatch[`${baseCreds.urlSlug}-${baseCreds.sceneDropId}`];
    expect(scoped.activeDraft).toBeUndefined();
    expect(scoped.contributedMonsters[monsterId]).toMatchObject({
      section: "legs",
      completedAt: expect.any(Number),
    });
  });

  test("POST /monsters/:id/section on non-final submit stores picks on visitor data + skips finalize", async () => {
    const monsterId = "mon-partial";
    const keyAssetData = defaultKeyAssetDataObject();
    keyAssetData.monsters = {
      [monsterId]: {
        monsterId,
        state: "in-progress",
        createdAt: 1,
        lastEditedAt: 2,
        sections: {
          head: {
            status: "locked",
            contributorProfileId: baseCreds.profileId,
            contributorDisplayName: baseCreds.displayName,
            lockedAt: 5,
          },
          torso: { status: "available" },
          legs: { status: "available" },
        },
        contributorProfileIds: [],
      },
    };

    mockUtils.getCredentials.mockReturnValue(baseCreds);
    mockUtils.getKeyAsset.mockResolvedValue(makeKeyAsset(keyAssetData));
    const visitor = makeVisitor();
    mockUtils.getVisitor.mockResolvedValue({
      visitor,
      isAdmin: false,
      visitorData: emptyVisitorData,
      visitorInventory: {},
    });

    const app = makeApp();
    const res = await request(app)
      .post(`/api/monsters/${monsterId}/section`)
      .send({ ...baseCreds, section: "head", picks: HEAD_PICKS, nameToken: "Harold" });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      isComplete: false,
      composedName: null,
      imageUrl: null,
      monsterAssetId: null,
    });
    expect(mockUtils.finalizeMonster).not.toHaveBeenCalled();

    // Picks + nameToken should have been saved to visitor contributedDrafts
    // so the client can render the layered preview on the Create tab.
    const visitorPatch = visitor.updateDataObject.mock.calls[0][0];
    const scoped = visitorPatch[`${baseCreds.urlSlug}-${baseCreds.sceneDropId}`];
    expect(scoped.contributedDrafts?.[monsterId]?.head).toMatchObject({
      picks: HEAD_PICKS,
      nameToken: "Harold",
    });
  });

  test("POST /monsters/:id/section rejects picks that don't match server-side content", async () => {
    const monsterId = "mon-bad-picks";
    const keyAssetData = defaultKeyAssetDataObject();
    keyAssetData.monsters = {
      [monsterId]: {
        monsterId,
        state: "in-progress",
        createdAt: 1,
        lastEditedAt: 2,
        sections: {
          head: {
            status: "locked",
            contributorProfileId: baseCreds.profileId,
            contributorDisplayName: baseCreds.displayName,
            lockedAt: 5,
          },
          torso: { status: "available" },
          legs: { status: "available" },
        },
        contributorProfileIds: [],
      },
    };

    mockUtils.getCredentials.mockReturnValue(baseCreds);
    mockUtils.getKeyAsset.mockResolvedValue(makeKeyAsset(keyAssetData));
    mockUtils.getVisitor.mockResolvedValue({
      visitor: makeVisitor(),
      isAdmin: false,
      visitorData: emptyVisitorData,
      visitorInventory: {},
    });

    const app = makeApp();
    const res = await request(app)
      .post(`/api/monsters/${monsterId}/section`)
      .send({
        ...baseCreds,
        section: "head",
        picks: { ...HEAD_PICKS, headShape: "not-a-real-part" },
        nameToken: "Harold",
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/unknown part/);
  });

  test("DELETE /monsters/:id rejects non-admin callers", async () => {
    const monsterId = "mon-forbidden";
    const keyAssetData = defaultKeyAssetDataObject();
    keyAssetData.monsters = {
      [monsterId]: {
        monsterId,
        state: "in-progress",
        createdAt: 1,
        lastEditedAt: 2,
        sections: { head: { status: "available" }, torso: { status: "available" }, legs: { status: "available" } },
        contributorProfileIds: [],
      },
    };
    mockUtils.getCredentials.mockReturnValue(baseCreds);
    mockUtils.getKeyAsset.mockResolvedValue(makeKeyAsset(keyAssetData));
    mockUtils.getVisitor.mockResolvedValue({
      visitor: makeVisitor(),
      isAdmin: false,
      visitorData: emptyVisitorData,
      visitorInventory: {},
    });

    const app = makeApp();
    const res = await request(app).delete(`/api/monsters/${monsterId}`).send(baseCreds);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test("DELETE /monsters/:id (in-progress) removes from roster + clears contributors' contributedMonsters", async () => {
    const monsterId = "mon-inprogress-delete";
    const keyAssetData = defaultKeyAssetDataObject();
    keyAssetData.monsters = {
      [monsterId]: {
        monsterId,
        state: "in-progress",
        createdAt: 1,
        lastEditedAt: 2,
        sections: {
          head: {
            status: "done",
            contributorProfileId: "profile-9",
            contributorDisplayName: "Zed",
            submittedAt: 3,
          },
          torso: { status: "locked", contributorProfileId: "profile-8", lockedAt: 4 },
          legs: { status: "available" },
        },
        contributorProfileIds: ["profile-9"],
      },
    };

    const keyAsset = makeKeyAsset(keyAssetData);
    mockUtils.getCredentials.mockReturnValue(baseCreds);
    mockUtils.getKeyAsset.mockResolvedValue(keyAsset);
    mockUtils.getVisitor.mockResolvedValue({
      visitor: makeVisitor(),
      isAdmin: true,
      visitorData: emptyVisitorData,
      visitorInventory: {},
    });

    const app = makeApp();
    const res = await request(app).delete(`/api/monsters/${monsterId}`).send(baseCreds);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ monsterId, state: "in-progress", deletedDroppedAsset: false });
    expect(keyAsset.dataObject.monsters[monsterId]).toBeUndefined();
    // No dropped-asset delete on the in-progress path.
    expect(topiaMock.worldDeleteDroppedAssetsSpy).not.toHaveBeenCalled();
  });

  test("DELETE /monsters/:id (complete) removes dropped asset + strips vote-cycle pool + tallies", async () => {
    const monsterId = "mon-complete-delete";
    const droppedId = "dropped-mon-42";
    const keyAssetData = defaultKeyAssetDataObject();
    keyAssetData.monsters = {
      [monsterId]: {
        monsterId,
        monsterAssetId: droppedId,
        state: "complete",
        createdAt: 1,
        lastEditedAt: 2,
        name: "Harold McFishy the Magnificent",
        imageUrl: "https://example.com/monster.png",
        sections: {
          head: { status: "done", contributorProfileId: "profile-9", submittedAt: 3 },
          torso: { status: "done", contributorProfileId: "profile-8", submittedAt: 4 },
          legs: { status: "done", contributorProfileId: "profile-7", submittedAt: 5 },
        },
        contributorProfileIds: ["profile-9", "profile-8", "profile-7"],
      },
    };
    keyAssetData.currentSubmissionWindow = {
      windowId: "2026-09-13",
      startAt: 1,
      endAt: 2,
      eligibleMonsterIds: [monsterId, "other-monster"],
    };
    keyAssetData.currentVoteCycle = {
      cycleId: "c1",
      category: "silliest",
      startAt: 1,
      endAt: 2,
      poolMonsterIds: [monsterId, "other-monster"],
      tallies: { [monsterId]: { shown: 4, wins: 2 }, "other-monster": { shown: 3, wins: 1 } },
      totalMatchupsServed: 7,
    };

    const keyAsset = makeKeyAsset(keyAssetData);
    mockUtils.getCredentials.mockReturnValue(baseCreds);
    mockUtils.getKeyAsset.mockResolvedValue(keyAsset);
    mockUtils.getVisitor.mockResolvedValue({
      visitor: makeVisitor(),
      isAdmin: true,
      visitorData: emptyVisitorData,
      visitorInventory: {},
    });

    const app = makeApp();
    const res = await request(app).delete(`/api/monsters/${monsterId}`).send(baseCreds);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      monsterId,
      state: "complete",
      deletedDroppedAsset: true,
      contributorProfileIds: ["profile-9", "profile-8", "profile-7"],
    });
    expect(topiaMock.worldDeleteDroppedAssetsSpy).toHaveBeenCalledWith(
      baseCreds.urlSlug,
      [droppedId],
      expect.any(String),
      expect.any(Object),
    );
    // Roster + window + cycle all cleaned.
    expect(keyAsset.dataObject.monsters[monsterId]).toBeUndefined();
    expect(keyAsset.dataObject.currentSubmissionWindow.eligibleMonsterIds).toEqual(["other-monster"]);
    expect(keyAsset.dataObject.currentVoteCycle.poolMonsterIds).toEqual(["other-monster"]);
    expect(keyAsset.dataObject.currentVoteCycle.tallies).toEqual({ "other-monster": { shown: 3, wins: 1 } });
  });

  test("GET /gallery returns only finished monsters by default (newest first)", async () => {
    const keyAssetData = defaultKeyAssetDataObject();
    keyAssetData.monsters = {
      "mon-a": {
        monsterId: "mon-a",
        state: "complete",
        createdAt: 1,
        lastEditedAt: 5,
        birthdate: 5,
        name: "Alpha",
        imageUrl: "https://example.com/a.png",
        sections: {
          head: { status: "done", contributorProfileId: "p1", contributorDisplayName: "One", submittedAt: 1 },
          torso: { status: "done", contributorProfileId: "p2", contributorDisplayName: "Two", submittedAt: 2 },
          legs: { status: "done", contributorProfileId: "p3", contributorDisplayName: "Three", submittedAt: 3 },
        },
        contributorProfileIds: ["p1", "p2", "p3"],
      },
      "mon-b": {
        monsterId: "mon-b",
        state: "complete",
        createdAt: 1,
        lastEditedAt: 10,
        birthdate: 10,
        name: "Bravo",
        imageUrl: "https://example.com/b.png",
        sections: {
          head: { status: "done", contributorProfileId: "p4", contributorDisplayName: "Four", submittedAt: 1 },
          torso: { status: "done", contributorProfileId: "p5", contributorDisplayName: "Five", submittedAt: 2 },
          legs: { status: "done", contributorProfileId: "p6", contributorDisplayName: "Six", submittedAt: 3 },
        },
        contributorProfileIds: ["p4", "p5", "p6"],
      },
      "mon-in-progress": {
        monsterId: "mon-in-progress",
        state: "in-progress",
        createdAt: 1,
        lastEditedAt: 20,
        sections: { head: { status: "available" }, torso: { status: "available" }, legs: { status: "available" } },
        contributorProfileIds: [],
      },
    };

    mockUtils.getCredentials.mockReturnValue(baseCreds);
    mockUtils.getKeyAsset.mockResolvedValue(makeKeyAsset(keyAssetData));
    mockUtils.getVisitor.mockResolvedValue({
      visitor: makeVisitor(),
      isAdmin: false,
      visitorData: emptyVisitorData,
      visitorInventory: {},
    });

    const app = makeApp();
    const res = await request(app).get("/api/gallery").query(baseCreds as any);

    expect(res.status).toBe(200);
    expect(res.body.data.monsters).toHaveLength(2);
    // Newest first: Bravo (birthdate 10) before Alpha (birthdate 5).
    expect(res.body.data.monsters.map((m: any) => m.monsterId)).toEqual(["mon-b", "mon-a"]);
    expect(res.body.data.filter).toEqual({ mine: false, winners: false });
    expect(res.body.data.sort).toBe("newest");
    expect(res.body.data.totalOnRoster).toBe(2);
  });

  test("GET /gallery?mine=true includes evicted monsters from the caller's contributedMonsters", async () => {
    const evictedMonsterId = "mon-evicted";
    const keyAssetData = defaultKeyAssetDataObject();
    // Roster does NOT include the evicted monster.
    keyAssetData.monsters = {
      "mon-on-roster": {
        monsterId: "mon-on-roster",
        state: "complete",
        createdAt: 1,
        lastEditedAt: 5,
        birthdate: 5,
        name: "OnRoster",
        imageUrl: "https://example.com/roster.png",
        sections: {
          head: { status: "done", contributorProfileId: baseCreds.profileId, submittedAt: 1 },
          torso: { status: "done", contributorProfileId: "p2", submittedAt: 2 },
          legs: { status: "done", contributorProfileId: "p3", submittedAt: 3 },
        },
        contributorProfileIds: [baseCreds.profileId, "p2", "p3"],
      },
    };

    mockUtils.getCredentials.mockReturnValue(baseCreds);
    mockUtils.getKeyAsset.mockResolvedValue(makeKeyAsset(keyAssetData));
    mockUtils.getVisitor.mockResolvedValue({
      visitor: makeVisitor(),
      isAdmin: false,
      visitorData: {
        ...emptyVisitorData,
        contributedMonsters: {
          "mon-on-roster": { section: "head", submittedAt: 1, completedAt: 5 },
          [evictedMonsterId]: {
            section: "torso",
            submittedAt: 1,
            completedAt: 100,
            monsterAssetId: "dropped-evicted",
            name: "OldEvicted",
            birthdate: 100,
            imageUrl: "https://example.com/evicted.png",
            contributorProfileIds: [baseCreds.profileId, "p9", "p10"],
            contributorDisplayNames: ["Alice", "Nine", "Ten"],
          },
        },
      },
      visitorInventory: {},
    });

    const app = makeApp();
    const res = await request(app).get("/api/gallery").query({ ...baseCreds, mine: "true" });

    expect(res.status).toBe(200);
    const ids = res.body.data.monsters.map((m: any) => m.monsterId);
    expect(ids).toContain(evictedMonsterId);
    expect(ids).toContain("mon-on-roster");
    const evictedRow = res.body.data.monsters.find((m: any) => m.monsterId === evictedMonsterId);
    expect(evictedRow).toMatchObject({
      fromCallerHistory: true,
      callerContributed: true,
      name: "OldEvicted",
      imageUrl: "https://example.com/evicted.png",
    });
  });

  test("GET /gallery?winners=true filters to monsters with a latestAward only", async () => {
    const keyAssetData = defaultKeyAssetDataObject();
    keyAssetData.monsters = {
      "mon-no-award": {
        monsterId: "mon-no-award",
        state: "complete",
        createdAt: 1,
        lastEditedAt: 5,
        birthdate: 5,
        name: "NoAward",
        imageUrl: "https://example.com/na.png",
        sections: {
          head: { status: "done", contributorProfileId: "p1", submittedAt: 1 },
          torso: { status: "done", contributorProfileId: "p2", submittedAt: 2 },
          legs: { status: "done", contributorProfileId: "p3", submittedAt: 3 },
        },
        contributorProfileIds: ["p1", "p2", "p3"],
      },
      "mon-award": {
        monsterId: "mon-award",
        state: "complete",
        createdAt: 1,
        lastEditedAt: 10,
        birthdate: 10,
        name: "Award",
        imageUrl: "https://example.com/aw.png",
        latestAward: { category: "silliest", place: 1, awardedAt: 20 },
        sections: {
          head: { status: "done", contributorProfileId: "p4", submittedAt: 1 },
          torso: { status: "done", contributorProfileId: "p5", submittedAt: 2 },
          legs: { status: "done", contributorProfileId: "p6", submittedAt: 3 },
        },
        contributorProfileIds: ["p4", "p5", "p6"],
      },
    };

    mockUtils.getCredentials.mockReturnValue(baseCreds);
    mockUtils.getKeyAsset.mockResolvedValue(makeKeyAsset(keyAssetData));
    mockUtils.getVisitor.mockResolvedValue({
      visitor: makeVisitor(),
      isAdmin: false,
      visitorData: emptyVisitorData,
      visitorInventory: {},
    });

    const app = makeApp();
    const res = await request(app).get("/api/gallery").query({ ...baseCreds, winners: "true" });

    expect(res.status).toBe(200);
    expect(res.body.data.monsters).toHaveLength(1);
    expect(res.body.data.monsters[0].monsterId).toBe("mon-award");
  });

  test("GET /monsters/:id returns single-monster payload (roster hit) + admin canDelete=true", async () => {
    const monsterId = "mon-detail";
    const keyAssetData = defaultKeyAssetDataObject();
    keyAssetData.monsters = {
      [monsterId]: {
        monsterId,
        state: "complete",
        createdAt: 1,
        lastEditedAt: 5,
        birthdate: 5,
        name: "Detailed",
        imageUrl: "https://example.com/detail.png",
        latestAward: { category: "silliest", place: 2, awardedAt: 20 },
        sections: {
          head: { status: "done", contributorProfileId: "p1", contributorDisplayName: "One", submittedAt: 1 },
          torso: { status: "done", contributorProfileId: "p2", contributorDisplayName: "Two", submittedAt: 2 },
          legs: { status: "done", contributorProfileId: "p3", contributorDisplayName: "Three", submittedAt: 3 },
        },
        contributorProfileIds: ["p1", "p2", "p3"],
      },
    };

    mockUtils.getCredentials.mockReturnValue(baseCreds);
    mockUtils.getKeyAsset.mockResolvedValue(makeKeyAsset(keyAssetData));
    mockUtils.getVisitor.mockResolvedValue({
      visitor: makeVisitor(),
      isAdmin: true,
      visitorData: emptyVisitorData,
      visitorInventory: {},
    });

    const app = makeApp();
    const res = await request(app).get(`/api/monsters/${monsterId}`).query(baseCreds as any);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      monster: {
        monsterId,
        name: "Detailed",
        imageUrl: "https://example.com/detail.png",
        latestAward: { category: "silliest", place: 2 },
        contributorDisplayNames: ["One", "Two", "Three"],
      },
      canDelete: true,
    });
  });

  test("GET /vote returns not-enough-monsters when the current window has < 10 eligible", async () => {
    const keyAssetData = defaultKeyAssetDataObject();
    keyAssetData.currentSubmissionWindow = {
      windowId: "2026-09-20",
      startAt: Date.now(),
      endAt: Date.now() + 86400_000 * 7,
      eligibleMonsterIds: ["a", "b", "c"],
    };
    mockUtils.getCredentials.mockReturnValue(baseCreds);
    mockUtils.getKeyAsset.mockResolvedValue(makeKeyAsset(keyAssetData));
    mockUtils.getVisitor.mockResolvedValue({
      visitor: makeVisitor(),
      isAdmin: false,
      visitorData: emptyVisitorData,
      visitorInventory: {},
    });

    const app = makeApp();
    const res = await request(app).get("/api/vote").query(baseCreds as any);
    expect(res.status).toBe(200);
    expect(res.body.data.state).toBe("not-enough-monsters");
    expect(res.body.data.poolSize).toBe(3);
    expect(res.body.data.minPoolSize).toBe(10);
  });

  test("GET /vote returns running state with matchup + last winners when a cycle is open", async () => {
    const pool = ["m1", "m2", "m3", "m4", "m5"];
    const keyAssetData = defaultKeyAssetDataObject();
    for (const id of pool) {
      keyAssetData.monsters[id] = {
        monsterId: id,
        state: "complete",
        createdAt: 1,
        lastEditedAt: 5,
        birthdate: 5,
        name: id,
        imageUrl: `https://ex/${id}.png`,
        sections: {
          head: { status: "done", contributorProfileId: "p1", submittedAt: 1 },
          torso: { status: "done", contributorProfileId: "p2", submittedAt: 2 },
          legs: { status: "done", contributorProfileId: "p3", submittedAt: 3 },
        },
        contributorProfileIds: ["p1", "p2", "p3"],
      };
    }
    keyAssetData.currentVoteCycle = {
      cycleId: "c1",
      category: "silliest",
      startAt: Date.now(),
      endAt: Date.now() + 86400_000 * 3,
      poolMonsterIds: pool,
      tallies: {},
      totalMatchupsServed: 0,
    };
    keyAssetData.storedWinners = [
      {
        monsterId: "m1",
        category: "cutest",
        place: 1,
        awardedAt: 10,
        contributorProfileIds: ["p1"],
        snapshotName: "Prior winner",
        snapshotImageUrl: "https://ex/prior.png",
      },
    ];
    mockUtils.getCredentials.mockReturnValue(baseCreds);
    mockUtils.getKeyAsset.mockResolvedValue(makeKeyAsset(keyAssetData));
    mockUtils.getVisitor.mockResolvedValue({
      visitor: makeVisitor(),
      isAdmin: false,
      visitorData: emptyVisitorData,
      visitorInventory: {},
    });

    const app = makeApp();
    const res = await request(app).get("/api/vote").query(baseCreds as any);
    expect(res.status).toBe(200);
    expect(res.body.data.state).toBe("running");
    expect(res.body.data.categoryQuestion).toBe("Silliest");
    expect(res.body.data.matchup).toBeTruthy();
    expect(res.body.data.matchup.pair).toHaveLength(2);
    expect(res.body.data.lastWinners).toHaveLength(1);
  });

  test("POST /vote/cast increments winner tallies + rejects when caller hits cap", async () => {
    const cycle = {
      cycleId: "c1",
      category: "silliest",
      startAt: Date.now(),
      endAt: Date.now() + 86400_000 * 3,
      poolMonsterIds: ["m1", "m2"],
      tallies: {},
      totalMatchupsServed: 0,
    };
    const keyAssetData = defaultKeyAssetDataObject();
    keyAssetData.currentVoteCycle = cycle;
    for (const id of ["m1", "m2"]) {
      keyAssetData.monsters[id] = {
        monsterId: id,
        state: "complete",
        createdAt: 1,
        lastEditedAt: 5,
        birthdate: 5,
        name: id,
        imageUrl: `https://ex/${id}.png`,
        sections: {
          head: { status: "done", contributorProfileId: "p1", submittedAt: 1 },
          torso: { status: "done", contributorProfileId: "p2", submittedAt: 2 },
          legs: { status: "done", contributorProfileId: "p3", submittedAt: 3 },
        },
        contributorProfileIds: ["p1", "p2", "p3"],
      };
    }

    const keyAsset = makeKeyAsset(keyAssetData);
    const visitor = makeVisitor();
    mockUtils.getCredentials.mockReturnValue(baseCreds);
    mockUtils.getKeyAsset.mockResolvedValue(keyAsset);
    mockUtils.getVisitor.mockResolvedValue({
      visitor,
      isAdmin: false,
      visitorData: emptyVisitorData,
      visitorInventory: {},
    });

    const app = makeApp();
    const res = await request(app).post("/api/vote/cast").send({
      ...baseCreds,
      winnerMonsterId: "m1",
      loserMonsterId: "m2",
    });
    expect(res.status).toBe(200);
    expect(res.body.data.ok).toBe(true);
    expect(keyAsset.dataObject.currentVoteCycle.tallies.m1).toEqual({ wins: 1, shown: 1 });
    expect(keyAsset.dataObject.currentVoteCycle.tallies.m2).toEqual({ wins: 0, shown: 1 });

    // Now bump the visitor's count above cap and try again.
    const capped = { ...emptyVisitorData, votesCastThisWeek: { windowId: "c1", count: 999 } };
    mockUtils.getVisitor.mockResolvedValue({
      visitor: makeVisitor(),
      isAdmin: false,
      visitorData: capped,
      visitorInventory: {},
    });
    const res2 = await request(app).post("/api/vote/cast").send({
      ...baseCreds,
      winnerMonsterId: "m1",
      loserMonsterId: "m2",
    });
    expect(res2.status).toBe(429);
  });

  test("POST /banners/acknowledge clears both pending queues", async () => {
    const keyAsset = makeKeyAsset(defaultKeyAssetDataObject());
    const visitor = makeVisitor();
    mockUtils.getCredentials.mockReturnValue(baseCreds);
    mockUtils.getKeyAsset.mockResolvedValue(keyAsset);
    mockUtils.getVisitor.mockResolvedValue({
      visitor,
      isAdmin: false,
      visitorData: {
        ...emptyVisitorData,
        pendingWinBanners: [{ monsterId: "m1", category: "silliest", place: 1, awardedAt: 1 } as any],
        pendingCompletionBanners: [{ monsterId: "m2", monsterName: "X", completedAt: 2 } as any],
      },
      visitorInventory: {},
    });

    const app = makeApp();
    const res = await request(app).post("/api/banners/acknowledge").send(baseCreds);
    expect(res.status).toBe(200);
    const patch = visitor.updateDataObject.mock.calls[0][0];
    const scoped = patch[`${baseCreds.urlSlug}-${baseCreds.sceneDropId}`];
    expect(scoped.pendingWinBanners).toEqual([]);
    expect(scoped.pendingCompletionBanners).toEqual([]);
  });

  test("GET /trophy returns leaderboard rows + badges grid", async () => {
    const keyAssetData = defaultKeyAssetDataObject();
    keyAssetData.trophyLeaderboard = {
      p1: { displayName: "Alpha", awardsWon: 5, monstersContributedTo: 12, lastActivityAt: 1 },
      p2: { displayName: "Beta", awardsWon: 3, monstersContributedTo: 10, lastActivityAt: 1 },
      [baseCreds.profileId]: { displayName: "Alice", awardsWon: 1, monstersContributedTo: 4, lastActivityAt: 1 },
    };
    mockUtils.getCredentials.mockReturnValue(baseCreds);
    mockUtils.getKeyAsset.mockResolvedValue(makeKeyAsset(keyAssetData));
    mockUtils.getVisitor.mockResolvedValue({
      visitor: makeVisitor(),
      isAdmin: true,
      visitorData: emptyVisitorData,
      visitorInventory: { "I Voted!": { id: "b1", icon: "https://x/y.png", name: "I Voted!" } },
    });

    const app = makeApp();
    const res = await request(app).get("/api/trophy").query(baseCreds as any);
    expect(res.status).toBe(200);
    expect(res.body.data.leaderboard).toHaveLength(3);
    expect(res.body.data.leaderboard[0].displayName).toBe("Alpha");
    expect(res.body.data.leaderboard[0].awardsWon).toBe(5);
    expect(res.body.data.isAdmin).toBe(true);
    // The 38-badge catalog surfaces; "I Voted!" is owned.
    expect(res.body.data.totalBadges).toBeGreaterThanOrEqual(21);
    const iVoted = res.body.data.badges.find((b: any) => b.name === "I Voted!");
    expect(iVoted?.owned).toBe(true);
  });

  test("POST /leaderboard/reset admin-only + wipes trophyLeaderboard", async () => {
    const keyAssetData = defaultKeyAssetDataObject();
    keyAssetData.trophyLeaderboard = { p1: { displayName: "Alpha", awardsWon: 5, monstersContributedTo: 3, lastActivityAt: 1 } };

    const app = makeApp();

    // Non-admin → 403.
    mockUtils.getCredentials.mockReturnValue(baseCreds);
    mockUtils.getKeyAsset.mockResolvedValue(makeKeyAsset(keyAssetData));
    mockUtils.getVisitor.mockResolvedValue({
      visitor: makeVisitor(),
      isAdmin: false,
      visitorData: emptyVisitorData,
      visitorInventory: {},
    });
    let res = await request(app).post("/api/leaderboard/reset").send(baseCreds);
    expect(res.status).toBe(403);

    // Admin → 200 + wipe.
    const adminKey = makeKeyAsset({ ...keyAssetData });
    mockUtils.getKeyAsset.mockResolvedValue(adminKey);
    mockUtils.getVisitor.mockResolvedValue({
      visitor: makeVisitor(),
      isAdmin: true,
      visitorData: emptyVisitorData,
      visitorInventory: {},
    });
    res = await request(app).post("/api/leaderboard/reset").send(baseCreds);
    expect(res.status).toBe(200);
    expect(adminKey.dataObject.trophyLeaderboard).toEqual({});
  });

  test("POST /monsters/:id/abandon releases the caller's lock + clears activeDraft", async () => {
    const monsterId = "mon-abandon";
    const keyAssetData = defaultKeyAssetDataObject();
    keyAssetData.monsters = {
      [monsterId]: {
        monsterId,
        state: "in-progress",
        createdAt: 1,
        lastEditedAt: 2,
        sections: {
          head: {
            status: "locked",
            contributorProfileId: baseCreds.profileId,
            contributorDisplayName: baseCreds.displayName,
            lockedAt: 5,
          },
          torso: { status: "available" },
          legs: { status: "available" },
        },
        contributorProfileIds: [],
      },
    };

    const keyAsset = makeKeyAsset(keyAssetData);
    const visitor = makeVisitor();
    mockUtils.getCredentials.mockReturnValue(baseCreds);
    mockUtils.getKeyAsset.mockResolvedValue(keyAsset);
    mockUtils.getVisitor.mockResolvedValue({
      visitor,
      isAdmin: false,
      visitorData: {
        ...emptyVisitorData,
        activeDraft: {
          monsterId,
          section: "head",
          lockedAt: 5,
          lastActivityAt: 5,
          picks: {},
        },
      },
      visitorInventory: {},
    });

    const app = makeApp();
    const res = await request(app)
      .post(`/api/monsters/${monsterId}/abandon`)
      .send(baseCreds);

    expect(res.status).toBe(200);
    expect(res.body.data.released).toBe("head");
    expect(keyAsset.dataObject.monsters[monsterId].sections.head.status).toBe("available");

    const visitorPatch = visitor.updateDataObject.mock.calls[0][0];
    const scoped = visitorPatch[`${baseCreds.urlSlug}-${baseCreds.sceneDropId}`];
    expect(scoped.activeDraft).toBeUndefined();
  });
});
