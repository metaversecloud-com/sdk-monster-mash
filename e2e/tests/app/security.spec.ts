// Abuse and concurrency: what a classroom of players clicking at once, or one player crafting requests,
// can do to the shared roster, the vote and the credits.
import { expect, test } from "../../fixtures";
import {
  NAME_TOKENS,
  PICKS,
  complete,
  draft,
  inProgress,
  keyAsset,
  lastWeeksWindow,
  playerData,
  roster,
  submittedDraft,
  voteCycle,
} from "../../helpers/monsterMash";

const KEY_ASSET_WRITE = "/assets/key-asset/update-data-object";

test("two teammates submitting their sections at the same moment both count", async ({ request, world }) => {
  test.fail(true, "EXP-MM: concurrent submits overwrite each other's section");
  const me = { profileId: world.profileId, displayName: world.displayName };
  const p1 = world.player(1);
  const p2 = world.player(2, { data: playerData({ activeDraft: draft("m1", "legs") }) });
  await world.seed({
    assetData: keyAsset({
      monsters: roster(inProgress("m1", { head: { status: "done", by: p1 }, torso: { status: "locked", by: me }, legs: { status: "locked", by: p2 } })),
    }),
    visitorData: { [world.scopedKey]: playerData({ activeDraft: draft("m1", "torso") }) },
    players: [p1, p2],
    // Both requests read the roster before either write lands, as two pods (or two slow calls) would.
    delays: { [KEY_ASSET_WRITE]: 500 },
  });

  const [torso, legs] = await Promise.all([
    request.post(world.api("/monsters/m1/section"), { data: { section: "torso", picks: PICKS.torso, nameToken: NAME_TOKENS.torso } }),
    request.post(world.api("/monsters/m1/section", world.as(p2)), { data: { section: "legs", picks: PICKS.legs, nameToken: NAME_TOKENS.legs } }),
  ]);

  // Both players were told their section was saved...
  expect(torso.ok()).toBe(true);
  expect(legs.ok()).toBe(true);
  // ...so neither section may be lost (one write replaces the whole sections map with its stale copy).
  const { sections } = (await world.assetData()).monsters.m1;
  expect(sections.torso).toMatchObject({ status: "done", contributorProfileId: world.profileId });
  expect(sections.legs).toMatchObject({ status: "done", contributorProfileId: p2.profileId });
});

test("votes cast at the same moment are all counted", async ({ request, world }) => {
  test.fail(true, "EXP-MM: concurrent votes overwrite each other's tally");
  const p1 = world.player(1);
  await world.seed({
    assetData: keyAsset({ monsters: roster(complete("ma"), complete("mb"), complete("mc")), currentVoteCycle: voteCycle(["ma", "mb", "mc"]) }),
    players: [p1],
    delays: { [KEY_ASSET_WRITE]: 500 },
  });

  const responses = await Promise.all([
    request.post(world.api("/vote/cast"), { data: { winnerMonsterId: "ma", loserMonsterId: "mb" } }),
    request.post(world.api("/vote/cast", world.as(p1)), { data: { winnerMonsterId: "ma", loserMonsterId: "mc" } }),
  ]);

  for (const response of responses) expect(response.ok()).toBe(true);
  expect((await world.assetData()).currentVoteCycle.tallies.ma).toEqual({ shown: 2, wins: 2 });
});

test("a vote must be for the matchup the player was shown", async ({ request, world }) => {
  test.fail(true, "EXP-MM: /vote/cast accepts any pair from the pool");
  await world.seed({
    assetData: keyAsset({
      monsters: roster(complete("ma"), complete("mb"), complete("mc"), complete("md")),
      currentVoteCycle: voteCycle(["ma", "mb", "mc", "md"]),
    }),
    visitorData: { [world.scopedKey]: playerData() },
  });
  const { data } = await (await request.get(world.api("/vote"))).json();
  const shown = data.matchup.pair.map((m: { monsterId: string }) => m.monsterId);
  const [mine, weakest] = ["ma", "mb", "mc", "md"].filter((id) => !shown.includes(id));

  // A player picks their own monster and the weakest rival instead of the pair the app served.
  const response = await request.post(world.api("/vote/cast"), {
    data: { winnerMonsterId: mine, loserMonsterId: weakest, matchupId: data.matchup.matchupId },
  });

  expect(response.ok()).toBe(false);
  expect((await world.assetData()).currentVoteCycle.tallies).toEqual({});
});

test("a display name with a pipe can't push teammates' names off a monster", async ({ request, world }) => {
  test.fail(true, "EXP-MM: contributorNames is pipe-joined without escaping");
  const id = `m-${world.urlSlug}`;
  const p1 = world.player(1, { displayName: "Mallory|Mallory", data: playerData({ contributedDrafts: submittedDraft(id, "head") }) });
  const p2 = world.player(2, { displayName: "Carol", data: playerData({ contributedDrafts: submittedDraft(id, "torso") }) });
  const viewer = world.player(3);
  const me = { profileId: world.profileId, displayName: world.displayName };
  await world.seed({
    assetData: keyAsset({
      monsters: roster(inProgress(id, { head: { status: "done", by: p1 }, torso: { status: "done", by: p2 }, legs: { status: "locked", by: me } })),
    }),
    visitorData: { [world.scopedKey]: playerData({ activeDraft: draft(id, "legs") }) },
    players: [p1, p2, viewer],
  });
  expect(
    (await request.post(world.api(`/monsters/${id}/section`), { data: { section: "legs", picks: PICKS.legs, nameToken: NAME_TOKENS.legs } })).ok(),
  ).toBe(true);

  // A player who never contributed to this monster opens the gallery.
  const { data } = await (await request.get(world.api("/gallery", world.as(viewer)))).json();
  const card = data.monsters.find((m: { monsterId: string }) => m.monsterId === id);
  expect(card.contributorDisplayNames).toHaveLength(3);
  expect(card.contributorDisplayNames.slice(1)).toEqual(["Carol", world.displayName]);
});

test("two players opening the app as the week rolls over crown the winners once", async ({ request, world }) => {
  test.fail(true, "EXP-MM: concurrent rollovers each crown the winners again");
  const p1 = world.player(1, { data: playerData({ contributedMonsters: { w0: { section: "head", submittedAt: 1 } } }) });
  const p3 = world.player(3);
  const winner = complete("w0", { contributors: [p1, world.player(2), world.player(4)] });
  await world.seed({
    assetData: keyAsset({
      monsters: roster(winner, complete("w1"), complete("w2"), complete("w3")),
      currentSubmissionWindow: lastWeeksWindow([]),
      currentVoteCycle: voteCycle(["w0", "w1", "w2", "w3"], { tallies: { w0: { shown: 9, wins: 9 } }, cycleId: "last-week-vote" }),
    }),
    visitorData: { [world.scopedKey]: playerData() },
    players: [p1, p3],
    delays: { [KEY_ASSET_WRITE]: 500 },
  });

  // The second player opens the app a moment after the first, before the first's rollover is saved.
  const first = request.get(world.api("/main-app"));
  await new Promise((resolve) => setTimeout(resolve, 250));
  const second = request.get(world.api("/main-app", world.as(p3)));
  for (const response of await Promise.all([first, second])) expect(response.ok()).toBe(true);

  // Player 1 helped build the winner: one win, one banner.
  expect((await world.playerData(p1.profileId)).pendingWinBanners).toHaveLength(1);
});

test("admin-only actions check the admin flag on the server", async ({ request, world }) => {
  const p1 = world.player(1);
  await world.seed({
    assetData: keyAsset({ monsters: roster(complete("m1", { contributors: [p1] })), leaderboard: { [p1.profileId]: "Player 1|1|1" } }),
    visitorData: { [world.scopedKey]: playerData() },
  });

  const attempts = [
    request.delete(world.api("/monsters/m1")),
    request.post(world.api("/admin/vote/start-new-cycle")),
    request.put(world.api("/admin/settings"), { data: { weeklyVotingEnabled: false } }),
    request.post(world.api("/leaderboard/reset")),
    // A forged isAdmin in the body or query is ignored.
    request.post(world.api("/leaderboard/reset", { isAdmin: "true" }), { data: { isAdmin: true } }),
  ];
  for (const response of await Promise.all(attempts)) expect(response.status()).toBe(403);

  const data = await world.assetData();
  expect(Object.keys(data.monsters)).toEqual(["m1"]);
  expect(data.weeklyVotingEnabled).toBe(true);
  expect(data.leaderboard).toEqual({ [p1.profileId]: "Player 1|1|1" });
  expect(await world.events("delete-asset")).toEqual([]);
});

test("a player can't release or submit a section someone else holds", async ({ request, world }) => {
  const p1 = world.player(1);
  await world.seed({
    assetData: keyAsset({ monsters: roster(inProgress("m1", { head: { status: "locked", by: p1 } })) }),
    visitorData: { [world.scopedKey]: playerData() },
  });

  const abandon = await request.post(world.api("/monsters/m1/abandon"));
  const submit = await request.post(world.api("/monsters/m1/section"), { data: { section: "head", picks: PICKS.head, nameToken: NAME_TOKENS.head } });
  const resume = await request.post(world.api("/monsters/m1/resume"), { data: { section: "head" } });

  expect(await abandon.json()).toMatchObject({ success: true, data: { released: null } });
  expect(submit.status()).toBe(409);
  expect(resume.status()).toBe(409);
  expect((await world.assetData()).monsters.m1.sections.head).toMatchObject({ status: "locked", contributorProfileId: p1.profileId });
  expect(await world.events("open-iframe")).toEqual([]);
});
