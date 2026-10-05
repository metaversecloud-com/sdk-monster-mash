import { Request, Response } from "express";
import { MIN_POOL_SIZE_FOR_VOTE, VOTING_CATEGORY_BY_ID } from "@shared/content/monsterMash.js";
import {
  CastVoteResponseData,
  KeyAssetDataObject,
  MonsterIndexEntry,
  MonsterMashVisitorData,
  VoteMatchupPayload,
  GalleryMonster,
} from "@shared/types/index.js";
import {
  contributorDisplayNamesFromEntry,
  errorHandler,
  etDateKey,
  getCredentials,
  getKeyAsset,
  getVisitor,
  pickMatchup,
} from "@utils/index.js";

/** Vote limits: `pool size × 1` per day, `pool size × 2` per cycle. */
const DAILY_CAP_MULTIPLIER = 1;
const CYCLE_CAP_MULTIPLIER = 2;

/**
 * POST /api/vote/cast
 * Body: { winnerMonsterId, matchupId, loserMonsterId }
 *
 * Increments the winner's `wins` + both monsters' `shown`, updates the
 * caller's per-cycle vote count, bumps `totalMatchupsServed`, and returns
 * the next matchup for the same session.
 */
export const handleCastVote = async (req: Request, res: Response) => {
  try {
    const source = req.body && req.body.interactiveNonce ? req.body : req.query;
    const credentials = getCredentials(source);
    const { profileId, urlSlug, sceneDropId } = credentials;

    const winnerMonsterId = req.body?.winnerMonsterId as string;
    const loserMonsterId = req.body?.loserMonsterId as string;
    if (!winnerMonsterId || !loserMonsterId) {
      return res.status(400).json({ success: false, message: "winner + loser monster ids required" });
    }

    const keyAsset = await getKeyAsset(credentials);
    const { visitor, visitorData } = await getVisitor(credentials);

    const dataObject = keyAsset.dataObject as KeyAssetDataObject;
    const cycle = dataObject.currentVoteCycle;
    if (!cycle) return res.status(409).json({ success: false, message: "No vote is running right now." });
    if (!cycle.poolMonsterIds.includes(winnerMonsterId) || !cycle.poolMonsterIds.includes(loserMonsterId)) {
      return res.status(400).json({ success: false, message: "Monster not in the current pool." });
    }

    // Vote-cap accounting — two independent caps per spec. Daily resets at
    // midnight ET; cycle resets when the window rolls over. Hitting either
    // blocks the vote with a cap-specific error so the client can show the
    // right message.
    const poolSizeNum = cycle.poolMonsterIds.length;
    const dailyCap = Math.max(0, poolSizeNum * DAILY_CAP_MULTIPLIER);
    const cycleCap = Math.max(0, poolSizeNum * CYCLE_CAP_MULTIPLIER);
    const todayKey = etDateKey(Date.now());
    const votedToday = visitorData.votesCastToday?.dateEt === todayKey ? visitorData.votesCastToday.count : 0;
    const votedCycle =
      visitorData.votesCastThisWeek?.windowId === cycle.cycleId ? visitorData.votesCastThisWeek.count : 0;
    if (cycleCap > 0 && votedCycle >= cycleCap) {
      return res.status(429).json({
        success: false,
        message: "You've reached your maximum votes for this cycle.",
        reason: "cycle-cap",
      });
    }
    if (dailyCap > 0 && votedToday >= dailyCap) {
      return res.status(429).json({
        success: false,
        message: "You've reached your maximum votes for today.",
        reason: "daily-cap",
      });
    }

    await keyAsset.fetchDataObject();
    const freshCycle = (keyAsset.dataObject as KeyAssetDataObject).currentVoteCycle;
    if (!freshCycle || freshCycle.cycleId !== cycle.cycleId) {
      return res.status(409).json({ success: false, message: "The cycle just closed." });
    }

    const tallies = { ...(freshCycle.tallies ?? {}) };
    const winnerRow = { ...(tallies[winnerMonsterId] ?? { shown: 0, wins: 0 }) };
    winnerRow.wins += 1;
    winnerRow.shown += 1;
    tallies[winnerMonsterId] = winnerRow;
    const loserRow = { ...(tallies[loserMonsterId] ?? { shown: 0, wins: 0 }) };
    loserRow.shown += 1;
    tallies[loserMonsterId] = loserRow;

    // Mirror the per-cycle `shown` bump into each monster's LIFETIME
    // `timesShown`. Tallies get wiped when a cycle closes, so without this
    // mirror we'd lose the "how often has this monster been seen" signal
    // that `advanceWeeklyCycle`'s short-pool backfill ranks on.
    const freshMonsters = (keyAsset.dataObject as KeyAssetDataObject).monsters ?? {};
    const winnerTimesShown = (freshMonsters[winnerMonsterId]?.timesShown ?? 0) + 1;
    const loserTimesShown = (freshMonsters[loserMonsterId]?.timesShown ?? 0) + 1;

    const nextCycle = {
      ...freshCycle,
      tallies,
      totalMatchupsServed: (freshCycle.totalMatchupsServed ?? 0) + 1,
    };

    await keyAsset.updateDataObject(
      {
        [`currentVoteCycle.tallies.${winnerMonsterId}`]: winnerRow,
        [`currentVoteCycle.tallies.${loserMonsterId}`]: loserRow,
        [`monsters.${winnerMonsterId}.timesShown`]: winnerTimesShown,
        [`monsters.${loserMonsterId}.timesShown`]: loserTimesShown,
        totalMatchupsServed: (freshCycle.totalMatchupsServed ?? 0) + 1,
      },
      {
        lock: {
          lockId: `${keyAsset.id}-vote-${cycle.cycleId}-${winnerMonsterId}-${loserMonsterId}-${Math.round(Date.now() / 5000) * 5000}`,
          releaseLock: true,
        },
        analytics: [
          {
            analyticName: "vote_cast",
            profileId,
            urlSlug,
            uniqueKey: `${profileId}-${cycle.cycleId}-${votedCycle + 1}`,
          },
        ],
      },
    );

    // Visitor tally. Both counters increment on every vote; `votesCastToday`
    // reseeds on the first vote of a new ET date, `votesCastThisWeek` on
    // every new cycleId. `votesByWeek` keeps the per-cycle counts that
    // `votesCastThisWeek` throws away each week — Monster Judge and Obsessed
    // Voter need the player's best single week, and Still Voting needs how
    // many weeks cleared a minimum.
    const nextVisitorData: MonsterMashVisitorData = {
      ...visitorData,
      votesCastThisWeek: { windowId: cycle.cycleId, count: votedCycle + 1 },
      votesCastToday: { dateEt: todayKey, count: votedToday + 1 },
      votesByWeek: { ...(visitorData.votesByWeek ?? {}), [cycle.cycleId]: votedCycle + 1 },
      totalVotesCast: (visitorData.totalVotesCast ?? 0) + 1,
      weeksVotedIn: dedupPush(visitorData.weeksVotedIn ?? [], cycle.cycleId),
    };
    const scopedKey = `${urlSlug}-${sceneDropId}`;
    await visitor.updateDataObject({ [scopedKey]: nextVisitorData }, {});

    // Next matchup (respects the newly-incremented caps).
    const newVotedToday = votedToday + 1;
    const newVotedCycle = votedCycle + 1;
    const hitDailyCap = dailyCap > 0 && newVotedToday >= dailyCap;
    const hitCycleCap = cycleCap > 0 && newVotedCycle >= cycleCap;
    const hitCap = hitDailyCap || hitCycleCap;
    let next: VoteMatchupPayload | null = null;
    if (!hitCap) {
      const raw = pickMatchup(nextCycle);
      if (raw) {
        const [aId, bId] = raw.pair;
        const a = monsterToGallery(dataObject.monsters?.[aId]);
        const b = monsterToGallery(dataObject.monsters?.[bId]);
        if (a && b) next = { matchupId: raw.matchupId, pair: [a, b] };
      }
    }

    // Sanity: log the pool size + question so this response is easy to debug.
    void VOTING_CATEGORY_BY_ID;
    void MIN_POOL_SIZE_FOR_VOTE;

    const payload: CastVoteResponseData = {
      ok: true,
      monster: { monsterId: winnerMonsterId, wins: winnerRow.wins, shown: winnerRow.shown },
      next,
      callerVoteState: {
        votedToday: newVotedToday,
        dailyCap,
        hitDailyCap,
        votedCycle: newVotedCycle,
        cycleCap,
        hitCycleCap,
        hitCap,
      },
    };
    return res.json({ success: true, data: payload });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleCastVote",
      message: "Error casting vote",
      req,
      res,
    });
  }
};

const dedupPush = <T>(arr: T[], value: T): T[] => (arr.includes(value) ? arr : [...arr, value]);

const monsterToGallery = (entry: MonsterIndexEntry | undefined): GalleryMonster | null => {
  if (!entry) return null;
  return {
    monsterId: entry.monsterId,
    monsterAssetId: entry.monsterAssetId,
    name: entry.name ?? "",
    birthdate: entry.birthdate ?? 0,
    imageUrl: entry.imageUrl ?? null,
    contributorProfileIds: entry.contributorProfileIds ?? [],
    contributorDisplayNames: contributorDisplayNamesFromEntry(entry),
    latestAward: entry.latestAward,
    callerContributed: false,
    fromCallerHistory: false,
  };
};
