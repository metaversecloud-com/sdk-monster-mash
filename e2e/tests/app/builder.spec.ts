// Monster Builder drawer: picking parts, auto-saving the draft, submitting a section, server-side pick
// validation, and finalizing a monster when its third section lands (compose, S3 upload, world drop).
import type { Page } from "@playwright/test";
import { FAKE_S3_BUCKET, MOCK_TOPIA_URL } from "../../constants";
import { expect, test, type TopiaWorld } from "../../fixtures";
import {
  NAME_TOKENS,
  PICKS,
  draft,
  inProgress,
  keyAsset,
  playerData,
  roster,
  submittedDraft,
  windowIdFor,
  type Section,
} from "../../helpers/monsterMash";

// The builder renders in Topia's fixed-width drawer.
test.use({ viewport: { width: 400, height: 900 } });

const s3Objects = async (page: Page) =>
  (await (await page.request.get(`${MOCK_TOPIA_URL}/__mock/s3`)).json()) as { key: string; size: number; contentType: string }[];

/** The player holds `section` of monster m1 (with the given teammates' sections). */
const seedHolding = async (
  world: TopiaWorld,
  section: Section,
  others: Parameters<typeof inProgress>[1] = {},
  extra = {},
  monsterId = "m1",
) => {
  const me = { profileId: world.profileId, displayName: world.displayName };
  const monster = inProgress(monsterId, { ...others, [section]: { status: "locked", by: me } });
  await world.seed({
    assetData: keyAsset({ monsters: roster(monster) }),
    visitorData: { [world.scopedKey]: playerData({ activeDraft: draft(monsterId, section) }) },
    ...extra,
  });
};

const openBuilder = (page: Page, world: TopiaWorld, section: Section, monsterId = "m1") =>
  page.goto(world.url("/", { screen: "builder", monsterId, section }));

/** Opens the category's accordion (if closed) and clicks the part's tile. */
const pick = async (page: Page, categoryId: string, part: string) => {
  const header = page.locator(`[aria-controls="accordion-panel-${categoryId}"]`);
  if ((await header.getAttribute("aria-expanded")) !== "true") await header.click();
  await page.getByRole("button", { name: part, exact: true }).click();
};

test("a player builds and submits a head through the drawer", async ({ page, world }) => {
  await seedHolding(world, "head");
  await openBuilder(page, world, "head");
  const submit = page.getByRole("button", { name: /Submit head/ });
  await expect(submit).toBeDisabled();

  await pick(page, "headShape", "alien-head");
  await pick(page, "eyes", "alien-eyes");
  await pick(page, "hair", "antennas");
  await page.locator("#name-token-head").selectOption("Harold");
  await submit.click();
  await page.getByRole("button", { name: "Submit Head", exact: true }).click();

  await expect(page.getByRole("heading", { name: "head submitted!" })).toBeVisible();
  const { monsters } = await world.assetData();
  expect(monsters.m1).toMatchObject({
    state: "in-progress",
    contributorProfileIds: [world.profileId],
    sections: {
      head: { status: "done", contributorProfileId: world.profileId, contributorDisplayName: world.displayName },
      torso: { status: "available" },
      legs: { status: "available" },
    },
  });
  const data = await world.playerData();
  expect(data.activeDraft).toBeUndefined();
  expect(data.contributedMonsters.m1).toMatchObject({ section: "head" });
  // Optional categories left empty are stored as NONE, so finalize can compose without them.
  expect(data.contributedDrafts.m1.head).toEqual({ picks: PICKS.head, nameToken: "Harold" });
  expect((await world.events("analytics")).map((e) => e.analyticName)).toContain("section_submitted_1");
});

test("picks are auto-saved to the player's draft while building", async ({ page, world }) => {
  await seedHolding(world, "torso");
  await openBuilder(page, world, "torso");

  await pick(page, "shirt", "cow-torso");
  await page.locator("#name-token-torso").selectOption("Snarfblat");

  await expect.poll(async () => (await world.playerData()).activeDraft).toMatchObject({
    monsterId: "m1",
    section: "torso",
    picks: { shirt: "cow-torso" },
    nameToken: "Snarfblat",
  });
  // Drafts never touch the shared roster.
  expect((await world.assetData()).monsters.m1.sections.torso.status).toBe("locked");
});

test("legs that can't wear feet replace the feet with NONE", async ({ page, world }) => {
  await seedHolding(world, "legs");
  await openBuilder(page, world, "legs");
  await pick(page, "feet", "flippers");

  await pick(page, "legs", "mermaid-tail");
  await expect(page.getByText("Those legs can't wear feet.")).toBeVisible();
  await page.getByRole("button", { name: "Use new legs" }).click();

  await expect.poll(async () => (await world.playerData()).activeDraft.picks).toMatchObject({ legs: "mermaid-tail", feet: "NONE" });
  await pick(page, "feet", "NONE");
  await expect(page.getByRole("button", { name: "flippers", exact: true })).toBeDisabled();
});

test("the server rejects picks the builder would never send", async ({ request, world }) => {
  await seedHolding(world, "legs");
  const submit = (picks: Record<string, string>, nameToken = NAME_TOKENS.legs) =>
    request.post(world.api("/monsters/m1/section"), { data: { section: "legs", picks, nameToken } });

  const invalid: [string, Record<string, string>, string?][] = [
    ["a head part under legs", { ...PICKS.legs, headShape: "alien-head" }],
    ["a part from another category", { ...PICKS.legs, waist: "flippers" }],
    ["an unknown part", { ...PICKS.legs, belt: "golden-belt" }],
    ["a required category left out", { ...PICKS.legs, legs: undefined as unknown as string }],
    ["NONE for a required category", { ...PICKS.legs, legs: "NONE" }],
    ["feet on legs that can't wear them", { ...PICKS.legs, legs: "mermaid-tail", feet: "flippers" }],
    ["a name token from another section", PICKS.legs, "Harold"],
    ["a made-up name token", PICKS.legs, "the Hacker"],
  ];
  for (const [label, picks, token] of invalid) {
    const response = await submit(JSON.parse(JSON.stringify(picks)), token);
    expect(response.status(), label).toBe(400);
  }

  expect((await world.assetData()).monsters.m1.sections.legs.status).toBe("locked");
  expect((await world.playerData()).contributedDrafts).toBeUndefined();
});

test("only the player holding a section can submit it, and only once", async ({ request, world }) => {
  const p1 = world.otherPlayer(1);
  await seedHolding(world, "head", { torso: { status: "locked", by: p1 } });
  const submit = (section: Section) =>
    request.post(world.api("/monsters/m1/section"), { data: { section, picks: PICKS[section], nameToken: NAME_TOKENS[section] } });

  expect((await submit("torso")).status(), "someone else's section").toBe(409);
  expect((await submit("legs")).status(), "an unclaimed section").toBe(409);
  expect((await submit("head")).ok()).toBe(true);
  expect((await submit("head")).status(), "submitting again").toBe(409);

  const { sections } = (await world.assetData()).monsters.m1;
  expect(sections.torso).toMatchObject({ status: "locked", contributorProfileId: p1.profileId });
  expect(sections.legs).toEqual({ status: "available" });
});

test("the third section brings the monster to life: image on S3, dropped in the world, teammates told", async ({ page, world }) => {
  // The S3 bucket is shared by all tests, so this monster's id is unique to the test.
  const id = `m-${world.urlSlug}`;
  const p1 = world.otherPlayer(1, { data: playerData({ contributedMonsters: { [id]: { section: "head", submittedAt: 1 } }, contributedDrafts: submittedDraft(id, "head") }) });
  const p2 = world.otherPlayer(2, { data: playerData({ contributedMonsters: { [id]: { section: "torso", submittedAt: 2 } }, contributedDrafts: submittedDraft(id, "torso") }) });
  await seedHolding(world, "legs", { head: { status: "done", by: p1 }, torso: { status: "done", by: p2 } }, { players: [p1, p2] }, id);
  await openBuilder(page, world, "legs", id);

  await pick(page, "legs", "alien-legs");
  await pick(page, "feet", "flippers");
  await page.locator("#name-token-legs").selectOption("the Magnificent");
  await page.getByRole("button", { name: /Submit legs/ }).click();
  await page.getByRole("button", { name: "Submit Legs", exact: true }).click();

  await expect(page.getByRole("heading", { name: "IT'S ALIVE!" })).toBeVisible();
  await expect(page.getByText("Harold McFishy the Magnificent")).toBeVisible();

  // The composed PNG goes to the app's S3 folder.
  const key = `userUploads/e2e-public-key/${id}.png`;
  const object = (await s3Objects(page)).find((o) => o.key === key);
  expect(object).toMatchObject({ contentType: "image/png" });
  expect(object!.size).toBeGreaterThan(1000);
  const imageUrl = `https://${FAKE_S3_BUCKET}.s3.amazonaws.com/${key}`;

  // The monster is dropped into the world as a clickable web image that opens its own drawer.
  const { assets } = await world.state();
  const dropped = Object.values(assets).find((a: any) => a.uniqueName === `MonsterMash-monster-${id}`) as any;
  expect(dropped).toMatchObject({ layer1: imageUrl, specialType: "webImage", isOpenLinkInDrawer: true, isInteractive: true, sceneDropId: "scene-1" });
  expect(Object.fromEntries(new URL(dropped.clickableLink).searchParams)).toEqual({ screen: "single-monster", monsterId: id });
  expect(dropped.dataObject).toMatchObject({
    monsterId: id,
    name: "Harold McFishy the Magnificent",
    imageUrl,
    keyAssetId: "key-asset",
    contributorProfileIds: [p1.profileId, p2.profileId, world.profileId],
    contributorDisplayNames: ["Player 1", "Player 2", world.displayName],
    sections: { legs: { parts: PICKS.legs, nameToken: "the Magnificent" } },
  });
  await expect.poll(async () => (await world.events("particles")).map((e) => e.particleName)).toEqual(["whiteStar_burst"]);

  // The roster keeps a lean complete entry, entered in this week's vote.
  const data = await world.assetData();
  expect(data.monsters[id]).toEqual({
    monsterId: id,
    state: "complete",
    birthdate: expect.any(Number),
    name: "Harold McFishy the Magnificent",
    contributorProfileIds: [p1.profileId, p2.profileId, world.profileId],
    contributorNames: `Player 1|Player 2|${world.displayName}`,
    monsterAssetId: dropped.id,
    imageUrl,
  });
  expect(data.currentSubmissionWindow).toMatchObject({ windowId: windowIdFor(), eligibleMonsterIds: [id] });

  // Teammates get a completion banner; everyone's draft picks are cleaned up.
  for (const peer of [p1, p2]) {
    const peerData = await world.playerData(peer.profileId);
    expect(peerData.pendingCompletionBanners).toEqual([{ monsterId: id, monsterName: "Harold McFishy the Magnificent", completedAt: expect.any(Number) }]);
    expect(peerData.contributedDrafts).toEqual({});
    expect(peerData.contributedMonsters[id]).toMatchObject({ name: "Harold McFishy the Magnificent", monsterAssetId: dropped.id });
  }
  const mine = await world.playerData();
  expect(mine.contributedDrafts).toEqual({});
  expect(mine.contributedMonsters[id]).toMatchObject({ section: "legs", wasThirdSection: true, name: "Harold McFishy the Magnificent" });
  expect(mine.pendingCompletionBanners).toEqual([]);
  expect((await world.events("analytics")).map((e) => e.analyticName)).toContain("section_submitted_3");
});

test("a third section whose teammate's picks are missing doesn't finalize a broken monster", async ({ request, world }) => {
  const p1 = world.otherPlayer(1, { data: playerData({ contributedDrafts: submittedDraft("m1", "head") }) });
  // Player 2's picks never reached their data object.
  const p2 = world.otherPlayer(2, { data: playerData() });
  await seedHolding(world, "legs", { head: { status: "done", by: p1 }, torso: { status: "done", by: p2 } }, { players: [p1, p2] });

  const response = await request.post(world.api("/monsters/m1/section"), {
    data: { section: "legs", picks: PICKS.legs, nameToken: NAME_TOKENS.legs },
  });

  expect(await response.json()).toMatchObject({ success: true, data: { isComplete: true, composedName: null, monsterAssetId: null } });
  const { monsters } = await world.assetData();
  expect(monsters.m1).toMatchObject({ state: "in-progress", finalizeAttempts: 1, sections: { legs: { status: "done" } } });
  expect(Object.keys((await world.state()).assets)).toEqual(["key-asset"]);
  // The submitter's picks are kept so a retry can still build the monster.
  expect((await world.playerData()).contributedDrafts.m1.legs).toEqual({ picks: PICKS.legs, nameToken: NAME_TOKENS.legs });
});
