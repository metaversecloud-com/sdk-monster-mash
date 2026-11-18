// Vote tab and the weekly cycle: head-to-head votes, the daily cap, the Sunday rollover that crowns
// winners, and the admin controls (force a new cycle, turn weekly voting off).
import { expect, test } from "../../fixtures";
import { complete, currentWindow, keyAsset, lastWeeksWindow, playerData, roster, voteCycle, windowIdFor } from "../../helpers/monsterMash";

const etToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

test("a player votes in the running matchup and gets the next one", async ({ page, world }) => {
  const a = complete("ma", { name: "Harold McFishy the Brave" });
  const b = complete("mb", { name: "Kitty Gloopers the Bold" });
  await world.seed({
    assetData: keyAsset({ monsters: roster(a, b), currentVoteCycle: voteCycle(["ma", "mb"]) }),
    visitorData: { [world.scopedKey]: playerData() },
  });
  await page.goto(world.url());
  await page.getByRole("tab", { name: "Vote" }).click();
  await expect(page.getByRole("heading", { name: "Which one is the Silliest?" })).toBeVisible();
  await expect(page.getByText("You've voted 0 of 2 times today.")).toBeVisible();

  const firstName = await page.getByRole("heading", { level: 4 }).first().textContent();
  const [winner, loser] = firstName === a.name ? ["ma", "mb"] : ["mb", "ma"];
  await page.getByRole("button", { name: "Vote for this one" }).first().click();

  await expect(page.getByText("You've voted 1 of 2 times today.")).toBeVisible();
  const data = await world.assetData();
  expect(data.currentVoteCycle.tallies).toEqual({ [winner]: { shown: 1, wins: 1 }, [loser]: { shown: 1, wins: 0 } });
  expect(data.monsters[winner].timesShown).toBe(1);
  expect(data.monsters[loser].timesShown).toBe(1);
  const cycleId = `${windowIdFor()}-vote`;
  expect(await world.playerData()).toMatchObject({
    totalVotesCast: 1,
    votesCastToday: { dateEt: etToday(), count: 1 },
    votesCastThisWeek: { windowId: cycleId, count: 1 },
    votesByWeek: { [cycleId]: 1 },
    weeksVotedIn: [cycleId],
  });
  expect((await world.events("analytics")).map((e) => e.analyticName)).toContain("vote_cast");
  await expect(page.getByRole("button", { name: "Vote for this one" })).toHaveCount(2);
});

test("the daily vote cap is the pool size", async ({ page, request, world }) => {
  const cycleId = `${windowIdFor()}-vote`;
  await world.seed({
    assetData: keyAsset({ monsters: roster(complete("ma"), complete("mb")), currentVoteCycle: voteCycle(["ma", "mb"]) }),
    visitorData: {
      [world.scopedKey]: playerData({ votesCastToday: { dateEt: etToday(), count: 2 }, votesCastThisWeek: { windowId: cycleId, count: 2 } }),
    },
  });

  const response = await request.post(world.api("/vote/cast"), { data: { winnerMonsterId: "ma", loserMonsterId: "mb" } });

  expect(response.status()).toBe(429);
  expect((await world.assetData()).currentVoteCycle.tallies).toEqual({});
  await page.goto(world.url());
  await page.getByRole("tab", { name: "Vote" }).click();
  await expect(page.getByText("You've reached your maximum votes for today! Come back tomorrow to vote again.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Vote for this one" })).toHaveCount(0);
});

test("votes for monsters outside the pool are refused", async ({ request, world }) => {
  await world.seed({
    assetData: keyAsset({ monsters: roster(complete("ma"), complete("mb"), complete("mc")), currentVoteCycle: voteCycle(["ma", "mb"]) }),
  });

  const response = await request.post(world.api("/vote/cast"), { data: { winnerMonsterId: "mc", loserMonsterId: "ma" } });

  expect(response.status()).toBe(400);
  expect((await world.assetData()).currentVoteCycle.tallies).toEqual({});
});

test("the Vote tab says how many more monsters a vote needs", async ({ page, world }) => {
  await world.seed({
    assetData: keyAsset({ monsters: roster(complete("ma"), complete("mb")), currentSubmissionWindow: currentWindow(["ma", "mb"]) }),
    visitorData: { [world.scopedKey]: playerData() },
  });

  await page.goto(world.url());
  await page.getByRole("tab", { name: "Vote" }).click();

  await expect(page.getByText("Not enough monsters for a vote yet")).toBeVisible();
  await expect(page.getByText("2 of the 10 monsters needed are in the pool.")).toBeVisible();
});

test("the Sunday rollover crowns last week's winners and opens the next vote", async ({ page, world }) => {
  const me = { profileId: world.profileId, displayName: world.displayName };
  const p1 = world.otherPlayer(1);
  const winner = complete("w0", { name: "Harold McFishy the Brave", contributors: [p1, world.otherPlayer(2), me] });
  const voted = [winner, complete("w1"), complete("w2"), complete("w3")];
  const fresh = Array.from({ length: 10 }, (_, i) => complete(`n${i}`));
  const tallies = {
    w0: { shown: 10, wins: 9 },
    w1: { shown: 10, wins: 7 },
    w2: { shown: 10, wins: 5 },
    w3: { shown: 10, wins: 1 },
  };
  await world.seed({
    assetData: keyAsset({
      monsters: roster(...voted, ...fresh),
      currentSubmissionWindow: lastWeeksWindow(fresh.map((m) => m.monsterId)),
      currentVoteCycle: voteCycle(["w0", "w1", "w2", "w3"], { tallies, cycleId: "last-week-vote" }),
      categoryNextIndex: 2,
    }),
    visitorData: { [world.scopedKey]: playerData({ contributedMonsters: { w0: { section: "legs", submittedAt: 1, name: winner.name } } }) },
    players: [{ ...p1, data: playerData({ contributedMonsters: { w0: { section: "head", submittedAt: 1 } } }) }],
  });

  await page.goto(world.url());

  await expect(page.getByText(/Your monster placed 1st in Silliest in the vote that ended/)).toBeVisible();
  const data = await world.assetData();
  expect(data.storedWinners).toEqual({
    w0: { category: "silliest", place: 1, awardedAt: expect.any(Number) },
    w1: { category: "silliest", place: 2, awardedAt: expect.any(Number) },
    w2: { category: "silliest", place: 3, awardedAt: expect.any(Number) },
  });
  // Last week's fresh monsters make the new pool; the category rotates.
  expect(data.currentSubmissionWindow).toMatchObject({ windowId: windowIdFor(), eligibleMonsterIds: [] });
  expect(data.currentVoteCycle).toMatchObject({ cycleId: `${windowIdFor()}-vote`, category: "best-dressed", tallies: {} });
  expect([...data.currentVoteCycle.poolMonsterIds].sort()).toEqual(fresh.map((m) => m.monsterId).sort());
  expect(data.categoryNextIndex).toBe(3);
  expect(data.leaderboard[world.profileId]).toBe(`${world.displayName}|1|1`);
  expect(data.leaderboard[p1.profileId]).toBe("Player 1|1|1");

  // The win is stamped on every contributor; the caller's banner is shown once with a toast.
  const peer = await world.playerData(p1.profileId);
  expect(peer.pendingWinBanners).toEqual([{ monsterId: "w0", category: "silliest", place: 1, awardedAt: expect.any(Number) }]);
  expect(peer.contributedMonsters.w0.awards).toEqual([{ category: "silliest", place: 1, awardedAt: expect.any(Number) }]);
  await expect.poll(async () => (await world.playerData()).pendingWinBanners).toEqual([]);
  expect((await world.playerData()).contributedMonsters.w0.awards).toEqual([{ category: "silliest", place: 1, awardedAt: expect.any(Number) }]);
  await expect.poll(() => world.events("fire-toast")).toContainEqual(
    expect.objectContaining({ title: "Your monster won!", text: "Your monster Harold McFishy the Brave placed 1st in Silliest" }),
  );
  // Winning the category earns its badge.
  await expect.poll(async () => (await world.events("grant-item")).map((e) => e.name)).toEqual(["Winner: Silliest"]);
  // One award per contributor, including the one who isn't in the world.
  expect((await world.events("analytics")).filter((e) => e.analyticName === "award_won")).toHaveLength(3);
});

test("an admin force-starts a new vote, crowning the running one", async ({ request, world }) => {
  const pool = Array.from({ length: 10 }, (_, i) => complete(`n${i}`));
  await world.seed({
    isAdmin: true,
    assetData: keyAsset({
      monsters: roster(complete("w0"), complete("w1"), complete("w2"), ...pool),
      currentSubmissionWindow: currentWindow(pool.map((m) => m.monsterId)),
      currentVoteCycle: voteCycle(["w0", "w1", "w2"], { tallies: { w0: { shown: 4, wins: 4 } } }),
    }),
  });

  const response = await request.post(world.api("/admin/vote/start-new-cycle"));

  expect(await response.json()).toMatchObject({ success: true, data: { freshlyCrownedCount: 3 } });
  const data = await world.assetData();
  expect(data.storedWinners.w0).toMatchObject({ place: 1, category: "silliest" });
  expect(data.currentVoteCycle.cycleId).toMatch(new RegExp(`^${windowIdFor()}-vote-\\d+$`));
  expect([...data.currentVoteCycle.poolMonsterIds].sort()).toEqual(pool.map((m) => m.monsterId).sort());
  expect((await world.events("analytics")).map((e) => e.analyticName)).toContain("admin_force_new_cycle");
});

test("only admins control voting", async ({ request, world }) => {
  const cycle = voteCycle(["ma", "mb"]);
  await world.seed({ assetData: keyAsset({ monsters: roster(complete("ma"), complete("mb")), currentVoteCycle: cycle }) });

  expect((await request.post(world.api("/admin/vote/start-new-cycle"))).status()).toBe(403);
  expect((await request.put(world.api("/admin/settings"), { data: { weeklyVotingEnabled: false } })).status()).toBe(403);
  expect((await request.post(world.api("/leaderboard/reset"))).status()).toBe(403);

  const data = await world.assetData();
  expect(data.weeklyVotingEnabled).toBe(true);
  expect(data.currentVoteCycle).toEqual(cycle);
});

test("turning weekly voting off ends the running vote without awards", async ({ page, request, world }) => {
  await world.seed({
    isAdmin: true,
    assetData: keyAsset({
      monsters: roster(complete("ma"), complete("mb")),
      currentVoteCycle: voteCycle(["ma", "mb"], { tallies: { ma: { shown: 3, wins: 3 } } }),
    }),
    visitorData: { [world.scopedKey]: playerData() },
  });

  const response = await request.put(world.api("/admin/settings"), { data: { weeklyVotingEnabled: false } });

  expect(await response.json()).toMatchObject({ success: true, data: { weeklyVotingEnabled: false, endedVote: true } });
  const data = await world.assetData();
  expect(data).toMatchObject({ weeklyVotingEnabled: false, currentVoteCycle: null, storedWinners: {} });
  expect((await world.events("analytics")).map((e) => e.analyticName)).toContain("voting_disabled");
  await page.goto(world.url());
  await page.getByRole("tab", { name: "Vote" }).click();
  await expect(page.getByText("Check in with your teacher about the next vote!")).toBeVisible();
  // A new vote can't be forced while voting is off.
  expect((await request.post(world.api("/admin/vote/start-new-cycle"))).status()).toBe(409);
});
