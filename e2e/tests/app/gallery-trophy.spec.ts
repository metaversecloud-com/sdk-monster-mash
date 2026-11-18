// Gallery, Single Monster View, Trophy drawer (leaderboard + badges), badge grants and banner acks.
import { expect, test } from "../../fixtures";
import { complete, keyAsset, playerData, roster } from "../../helpers/monsterMash";

test("the gallery shows finished monsters newest first, plus the player's own evicted ones", async ({ page, world }) => {
  const me = { profileId: world.profileId, displayName: world.displayName };
  const old = complete("m-old", { name: "Beatrix Gloopers the Bold", birthdate: Date.now() - 3 * 86_400_000 });
  const mine = complete("m-mine", { name: "Kitty Hemlock the Jolly", birthdate: Date.now() - 86_400_000, contributors: [world.otherPlayer(1), world.otherPlayer(2), me] });
  const evicted = {
    section: "head",
    submittedAt: 1,
    name: "Ophelia Oldbones the Ancient",
    imageUrl: "https://example.invalid/evicted.png",
    birthdate: Date.now() - 400 * 86_400_000,
    contributorDisplayNames: [world.displayName, "Player 1", "Player 2"],
  };
  await world.seed({
    assetData: keyAsset({ monsters: roster(old, mine), storedWinners: { "m-old": { category: "cutest", place: 2, awardedAt: Date.now() } } }),
    visitorData: { [world.scopedKey]: playerData({ contributedMonsters: { "m-mine": { section: "legs", submittedAt: 1 }, "m-gone": evicted } }) },
  });
  await page.goto(world.url());

  await page.getByRole("tab", { name: "Gallery" }).click();

  const names = page.getByRole("tabpanel").getByRole("heading", { level: 4 });
  await expect(names).toHaveText(["Kitty Hemlock the Jolly", "Beatrix Gloopers the Bold", "Ophelia Oldbones the Ancient"]);
  await page.getByLabel("Show only my monsters").check();
  await expect(names).toHaveText(["Kitty Hemlock the Jolly", "Ophelia Oldbones the Ancient"]);
  await page.getByLabel("Show only my monsters").uncheck();
  await page.getByLabel("Show only award winners").check();
  await expect(names).toHaveText(["Beatrix Gloopers the Bold"]);
});

test("a monster clicked in the world opens its own drawer with its makers", async ({ page, world }) => {
  const monster = complete("m1", { name: "Harold McFishy the Brave", contributors: [world.otherPlayer(1), world.otherPlayer(2), world.otherPlayer(3)] });
  await world.seed({ assetData: keyAsset({ monsters: roster(monster) }), visitorData: { [world.scopedKey]: playerData() } });

  await page.goto(world.url("/", { screen: "single-monster", monsterId: "m1" }));

  await expect(page.getByRole("heading", { name: "Harold McFishy the Brave" })).toBeVisible();
  await expect(page.getByText("by Player 1 · Player 2 · Player 3")).toBeVisible();
  await expect(page.getByRole("button", { name: /Delete/ })).toHaveCount(0);
  await expect.poll(async () => (await world.events("analytics")).map((e) => e.analyticName)).toContain("monster_viewed_other");
});

test("an admin deletes a finished monster: off the roster, out of the vote, gone from the world", async ({ page, world }) => {
  const p1 = world.otherPlayer(1, {
    data: playerData({
      contributedMonsters: { m1: { section: "head", submittedAt: 1, name: "Harold" } },
      pendingCompletionBanners: [{ monsterId: "m1", monsterName: "Harold", completedAt: 1 }],
    }),
  });
  const monster = complete("m1", { name: "Harold McFishy the Brave", contributors: [p1, world.otherPlayer(2), world.otherPlayer(3)] });
  await world.seed({
    isAdmin: true,
    assetData: keyAsset({
      monsters: roster(monster, complete("m2"), complete("m3")),
      currentSubmissionWindow: { windowId: "w", startAt: 0, endAt: Date.now() + 86_400_000, eligibleMonsterIds: ["m1", "m2"] },
    }),
    extraAssets: { "asset-m1": { id: "asset-m1", uniqueName: "MonsterMash-monster-m1", sceneDropId: "scene-1", dataObject: {} } },
    visitorData: { [world.scopedKey]: playerData() },
    players: [p1],
  });
  await page.goto(world.url("/", { screen: "single-monster", monsterId: "m1" }));

  await page.getByRole("button", { name: "Delete this monster (admin only)" }).click();
  await page.getByRole("button", { name: "Delete Monster", exact: true }).last().click();

  await expect.poll(async () => Object.keys((await world.assetData()).monsters).sort()).toEqual(["m2", "m3"]);
  expect((await world.assetData()).currentSubmissionWindow.eligibleMonsterIds).toEqual(["m2"]);
  await expect.poll(() => world.events("delete-asset")).toEqual([{ type: "delete-asset", assetId: "asset-m1" }]);
  await expect.poll(() => world.playerData(p1.profileId)).toMatchObject({ contributedMonsters: {}, pendingCompletionBanners: [] });
});

test("the Trophy drawer ranks award winners and shows the badge grid", async ({ page, request, world }) => {
  await world.seed({
    assetData: keyAsset({
      leaderboard: {
        [world.profileId]: `${world.displayName}|1|4`,
        a: "Ophelia|3|2",
        b: "Barnaby|1|5",
        c: "Zed|1|5",
      },
    }),
    visitorData: { [world.scopedKey]: playerData() },
    badges: ["Mad Scientist"],
  });

  await page.goto(world.url("/", { screen: "trophy" }));

  const rows = page.locator(".flex.items-center.gap-2.p-2");
  await expect(rows).toHaveText([/^1Ophelia32$/, /^2Barnaby15$/, /^3Zed15$/, new RegExp(`^4${world.displayName}14$`)]);
  const { data } = await (await request.get(world.api("/trophy"))).json();
  // Ordered by the catalog's sortOrder, then name. Inactive badges and non-badge items stay out.
  expect(data.badges.map((b: any) => [b.name, b.group, b.owned])).toEqual([
    ["Elite Masher", "visiting", false],
    ["I Voted!", "voting", false],
    ["Mad Scientist", "building", true],
    ["Winner: Silliest", "winning", false],
    ["Brainstormer", "building", false],
  ]);
  expect(data).toMatchObject({ ownedBadgesCount: 1, totalBadges: 5, isAdmin: false });
  await page.getByRole("tab", { name: "Badges" }).click();
  await expect(page.getByText("I Voted!")).toBeVisible();
  await expect(page.getByText("Retired Badge")).toHaveCount(0);
});

test("opening the app grants the badges the player has earned, once", async ({ page, world }) => {
  await world.seed({
    assetData: keyAsset(),
    visitorData: { [world.scopedKey]: playerData({ totalVotesCast: 1, monstersStarted: 1 }) },
    badges: ["Mad Scientist"],
  });

  await page.goto(world.url());

  await expect.poll(async () => (await world.events("grant-item")).map((e) => e.name)).toEqual(["I Voted"]);
  await expect.poll(() => world.events("fire-toast")).toContainEqual(expect.objectContaining({ title: "You unlocked the I Voted! badge!" }));
  expect((await world.events("analytics")).map((e) => e.analyticName)).toContain("badge_earned");

  await page.reload();
  await expect(page.getByRole("button", { name: /Create New Monster/ })).toBeVisible();
  expect(await world.events("grant-item")).toHaveLength(1);
});

test("an admin resets the leaderboard from the Trophy drawer", async ({ page, world }) => {
  await world.seed({
    isAdmin: true,
    assetData: keyAsset({ leaderboard: { a: "Ophelia|3|2" } }),
    visitorData: { [world.scopedKey]: playerData() },
  });
  await page.goto(world.url("/", { screen: "trophy" }));
  await expect(page.getByText("Ophelia")).toBeVisible();

  await page.getByRole("button", { name: "Reset Leaderboard" }).click();
  await page.getByRole("button", { name: /Reset/ }).last().click();

  await expect.poll(async () => (await world.assetData()).leaderboard).toEqual({});
  expect((await world.events("analytics")).map((e) => e.analyticName)).toContain("leaderboard_reset");
});

test("a completion banner shows once, with a toast, then clears", async ({ page, world }) => {
  await world.seed({
    assetData: keyAsset(),
    visitorData: {
      [world.scopedKey]: playerData({ pendingCompletionBanners: [{ monsterId: "m1", monsterName: "Kitty Hemlock the Jolly", completedAt: Date.now() }] }),
    },
  });

  await page.goto(world.url());

  await expect(page.getByText("Kitty Hemlock the Jolly is complete! A monster you helped build is finished.")).toBeVisible();
  await expect.poll(async () => (await world.playerData()).pendingCompletionBanners).toEqual([]);
  expect(await world.events("fire-toast")).toEqual([
    expect.objectContaining({ title: "A monster you helped build is finished!", text: "Kitty Hemlock the Jolly" }),
  ]);
  await page.reload();
  await expect(page.getByRole("button", { name: /Create New Monster/ })).toBeVisible();
  await expect(page.getByText(/is complete!/)).toHaveCount(0);
});
