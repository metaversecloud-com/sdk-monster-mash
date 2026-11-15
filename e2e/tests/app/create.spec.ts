// Create tab: starting a monster, joining, resuming and releasing sections, and the roster upkeep the
// main-app open does (stale locks, first-open setup).
import { expect, test } from "../../fixtures";
import { draft, inProgress, keyAsset, playerData, roster, windowIdFor } from "../../helpers/monsterMash";

const today = () => new Date().toISOString().slice(0, 10);

test("first open sets up the key asset and the player's Monster Mash data", async ({ page, world }) => {
  await world.seed();

  await page.goto(world.url());

  await expect(page.getByText('No monsters in progress yet - click "Create New Monster" to start one.')).toBeVisible();
  await expect.poll(() => world.assetData()).toMatchObject({
    schemaVersion: 1,
    weeklyVotingEnabled: true,
    monsters: {},
    currentVoteCycle: null,
    currentSubmissionWindow: { windowId: windowIdFor(), eligibleMonsterIds: [] },
  });
  await expect.poll(() => world.playerData()).toMatchObject({ schemaVersion: 1, daysAppOpened: [today()], totalVotesCast: 0 });
  await expect.poll(async () => (await world.events("analytics")).map((e) => e.analyticName).sort()).toEqual([
    "app_opened",
    "createTab_viewed",
  ]);
});

test("Create New Monster locks one section for the player and opens the builder drawer", async ({ page, world }) => {
  await world.seed({ assetData: keyAsset(), visitorData: { [world.scopedKey]: playerData() } });
  await page.goto(world.url());

  await page.getByRole("button", { name: /Create New Monster/ }).click();

  await expect.poll(async () => Object.keys((await world.assetData()).monsters)).toHaveLength(1);
  const [monster] = Object.values((await world.assetData()).monsters) as any[];
  const slots = Object.entries(monster.sections) as [string, any][];
  const locked = slots.filter(([, s]) => s.status === "locked");
  expect(locked).toHaveLength(1);
  expect(slots.filter(([, s]) => s.status === "available")).toHaveLength(2);
  const [section, slot] = locked[0];
  expect(slot).toMatchObject({ contributorProfileId: world.profileId, contributorDisplayName: world.displayName });
  expect(monster).toMatchObject({ state: "in-progress", contributorProfileIds: [] });

  await expect.poll(() => world.playerData()).toMatchObject({
    monstersStarted: 1,
    weeksStartedMonsterIn: [windowIdFor()],
    activeDraft: { monsterId: monster.monsterId, section, picks: {} },
  });
  expect((await world.events("analytics")).map((e) => e.analyticName)).toContain("section_claimed_1");

  // The modal closes and the builder opens in a drawer, carrying the session credentials.
  await expect.poll(() => world.events("open-iframe")).toHaveLength(1);
  expect(await world.events("close-iframe")).toHaveLength(1);
  const [open] = await world.events("open-iframe");
  expect(open.shouldOpenInDrawer).toBe(true);
  const link = new URL(open.link);
  expect(Object.fromEntries(link.searchParams)).toMatchObject({
    screen: "builder",
    monsterId: monster.monsterId,
    section,
    interactiveNonce: world.credentials().get("interactiveNonce"),
    visitorId: "42",
    urlSlug: world.urlSlug,
  });
});

test("a player with a section in progress can't start a second monster", async ({ request, world }) => {
  const mine = inProgress("m1", { head: { status: "locked", by: { profileId: world.profileId, displayName: world.displayName } } });
  await world.seed({
    assetData: keyAsset({ monsters: roster(mine) }),
    visitorData: { [world.scopedKey]: playerData({ activeDraft: draft("m1", "head") }) },
  });

  const response = await request.post(world.api("/monsters/start"));

  expect(response.status()).toBe(409);
  expect(Object.keys((await world.assetData()).monsters)).toEqual(["m1"]);
});

test("Join claims the open section of a teammate's monster", async ({ page, world }) => {
  const p1 = world.player(1);
  const p2 = world.player(2);
  const monster = inProgress("m1", { head: { status: "done", by: p1 }, torso: { status: "locked", by: p2 } });
  await world.seed({ assetData: keyAsset({ monsters: roster(monster) }), visitorData: { [world.scopedKey]: playerData() }, players: [p1, p2] });
  await page.goto(world.url());

  await page.getByRole("button", { name: "Join" }).click();

  await expect.poll(async () => (await world.assetData()).monsters.m1.sections.legs).toMatchObject({
    status: "locked",
    contributorProfileId: world.profileId,
  });
  // The teammates' sections are untouched.
  expect((await world.assetData()).monsters.m1.sections).toMatchObject({
    head: { status: "done", contributorProfileId: p1.profileId },
    torso: { status: "locked", contributorProfileId: p2.profileId },
  });
  await expect.poll(() => world.playerData()).toMatchObject({ activeDraft: { monsterId: "m1", section: "legs", joined: true } });
  // Two sections were already in play, so this is the third claim.
  expect((await world.events("analytics")).map((e) => e.analyticName)).toContain("section_claimed_3");
  const [open] = await world.events("open-iframe");
  expect(Object.fromEntries(new URL(open.link).searchParams)).toMatchObject({ screen: "builder", monsterId: "m1", section: "legs" });
});

test("joining a section someone else just took shows the race message", async ({ page, request, world }) => {
  const p1 = world.player(1);
  const p2 = world.player(2);
  const monster = inProgress("m1", { head: { status: "done", by: p1 }, torso: { status: "done", by: world.player(3) } });
  await world.seed({ assetData: keyAsset({ monsters: roster(monster) }), visitorData: { [world.scopedKey]: playerData() }, players: [p1, p2] });
  await page.goto(world.url());
  await expect(page.getByRole("button", { name: "Join" })).toBeVisible();

  // A teammate takes the legs while this player is still looking at the list.
  expect((await request.post(world.api("/monsters/m1/claim", world.as(p2)), { data: { section: "legs" } })).ok()).toBe(true);
  await page.getByRole("button", { name: "Join" }).click();

  await expect(page.getByText("Oops, that one was just claimed! Try another.")).toBeVisible();
  expect((await world.assetData()).monsters.m1.sections.legs.contributorProfileId).toBe(p2.profileId);
  expect((await world.playerData()).activeDraft).toBeUndefined();
});

test("a player can't build two sections of the same monster", async ({ request, world }) => {
  const me = { profileId: world.profileId, displayName: world.displayName };
  const monster = inProgress("m1", { head: { status: "done", by: me } });
  await world.seed({ assetData: keyAsset({ monsters: roster(monster) }), visitorData: { [world.scopedKey]: playerData() } });

  const response = await request.post(world.api("/monsters/m1/claim"), { data: { section: "torso" } });

  expect(response.status()).toBe(409);
  expect((await world.assetData()).monsters.m1.sections.torso).toEqual({ status: "available" });
});

test("Resume reopens the builder for the section the player holds", async ({ page, world }) => {
  const me = { profileId: world.profileId, displayName: world.displayName };
  const monster = inProgress("m1", { torso: { status: "locked", by: me } });
  await world.seed({
    assetData: keyAsset({ monsters: roster(monster) }),
    visitorData: { [world.scopedKey]: playerData({ activeDraft: draft("m1", "torso") }) },
  });
  await page.goto(world.url());

  await page.getByRole("button", { name: /^Resume torso/ }).click();

  await expect.poll(() => world.events("open-iframe")).toHaveLength(1);
  const [open] = await world.events("open-iframe");
  expect(Object.fromEntries(new URL(open.link).searchParams)).toMatchObject({ screen: "builder", monsterId: "m1", section: "torso" });
});

test("releasing a claim frees the section and clears the player's draft", async ({ request, world }) => {
  const me = { profileId: world.profileId, displayName: world.displayName };
  const p1 = world.player(1);
  const monster = inProgress("m1", { head: { status: "done", by: p1 }, legs: { status: "locked", by: me } });
  await world.seed({
    assetData: keyAsset({ monsters: roster(monster) }),
    visitorData: { [world.scopedKey]: playerData({ activeDraft: draft("m1", "legs") }) },
  });

  const response = await request.post(world.api("/monsters/m1/abandon"));

  expect(await response.json()).toMatchObject({ success: true, data: { released: "legs" } });
  const { sections } = (await world.assetData()).monsters.m1;
  expect(sections.legs).toEqual({ status: "available" });
  expect(sections.head).toMatchObject({ status: "done", contributorProfileId: p1.profileId });
  expect((await world.playerData()).activeDraft).toBeUndefined();
  expect((await world.events("analytics")).map((e) => e.analyticName)).toContain("section_abandoned");
});

test("opening the app frees locks idle for more than 30 minutes", async ({ page, world }) => {
  const p1 = world.player(1);
  const p2 = world.player(2);
  const stale = inProgress("m1", { head: { status: "done", by: p1 }, torso: { status: "locked", by: p2 } }, 31 * 60_000);
  const fresh = inProgress("m2", { torso: { status: "locked", by: p2 } }, 5 * 60_000);
  await world.seed({ assetData: keyAsset({ monsters: roster(stale, fresh) }), visitorData: { [world.scopedKey]: playerData() } });

  await page.goto(world.url());

  await expect.poll(async () => (await world.assetData()).monsters.m1.sections.torso).toEqual({ status: "available" });
  expect((await world.assetData()).monsters.m2.sections.torso).toMatchObject({ status: "locked", contributorProfileId: p2.profileId });
});

test("an admin deletes a monster in progress from the Create tab", async ({ page, world }) => {
  const p1 = world.player(1, { data: playerData({ contributedMonsters: { m1: { section: "head", submittedAt: 1 } } }) });
  const monster = inProgress("m1", { head: { status: "done", by: p1 } });
  await world.seed({
    isAdmin: true,
    assetData: keyAsset({ monsters: roster(monster) }),
    visitorData: { [world.scopedKey]: playerData() },
    players: [p1],
  });
  await page.goto(world.url());

  await page.getByLabel("Delete this monster in progress").click();
  await page.getByRole("button", { name: /Delete/ }).last().click();

  await expect.poll(async () => (await world.assetData()).monsters).toEqual({});
  await expect.poll(async () => (await world.playerData(p1.profileId)).contributedMonsters).toEqual({});
  expect((await world.events("analytics")).map((e) => e.analyticName)).toContain("monster_deleted");
});

test("a player who isn't an admin can't delete a monster", async ({ page, request, world }) => {
  const p1 = world.player(1);
  const monster = inProgress("m1", { head: { status: "done", by: p1 } });
  await world.seed({ assetData: keyAsset({ monsters: roster(monster) }), visitorData: { [world.scopedKey]: playerData() } });
  await page.goto(world.url());
  await expect(page.getByRole("button", { name: "Join" }).first()).toBeVisible();
  await expect(page.getByLabel("Delete this monster in progress")).toHaveCount(0);

  const response = await request.delete(world.api("/monsters/m1"));

  expect(response.status()).toBe(403);
  expect(Object.keys((await world.assetData()).monsters)).toEqual(["m1"]);
});
