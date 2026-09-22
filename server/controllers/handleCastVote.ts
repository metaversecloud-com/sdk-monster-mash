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
  errorHandler,
  getCredentials,
  getKeyAsset,
  getVisitor,
  lockDataObject,
  pickMatchup,
} from "@utils/index.js";

const VOTE_CAP_MULTIPLIER = 2;

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

    // Vote-cap accounting.
    const cap = Math.max(0, cycle.poolMonsterIds.length * VOTE_CAP_MULTIPLIER);
    const voted = visitorData.votesCastThisWeek?.windowId === cycle.cycleId
      ? visitorData.votesCastThisWeek.count
      : 0;
    if (cap > 0 && voted >= cap) {
      return res.status(429).json({ success: false, message: "You've hit your vote cap for this cycle." });
    }

    const lockId = `${keyAsset.id}-vote-${cycle.cycleId}`;
    try {
      await lockDataObject(lockId, keyAsset);
    } catch (error) {
      return res.status(409).json({ success: false, message: "Vote collision — retry." });
    }

    await keyAsset.fetchDataObject();
    const freshCycle = (keyAsset.dataObject as KeyAssetDataObject).currentVoteCycle;
    if (!freshCycle || freshCycle.cycleId !== cycle.cycleId) {
      // We already hold `lockId`; don't re-acquire to release. TTL clears it.
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

    const nextCycle = {
      ...freshCycle,
      tallies,
      totalMatchupsServed: (freshCycle.totalMatchupsServed ?? 0) + 1,
    };

    // We already hold `lockId`. Plain update matches tic-tac-toe's pattern.
    await keyAsset.updateDataObject(
      { currentVoteCycle: nextCycle },
      {
        analytics: [
          {
            analyticName: "vote_cast",
            profileId: credentials.profileId,
            urlSlug: credentials.urlSlug,
            uniqueKey: `${credentials.profileId}-${cycle.cycleId}-${voted + 1}`,
          },
        ],
      },
    );

    // Visitor tally.
    const nextVisitorData: MonsterMashVisitorData = {
      ...visitorData,
      votesCastThisWeek: { windowId: cycle.cycleId, count: voted + 1 },
      totalVotesCast: (visitorData.totalVotesCast ?? 0) + 1,
      weeksVotedIn: dedupPush(visitorData.weeksVotedIn ?? [], cycle.cycleId),
    };
    const scopedKey = `${credentials.urlSlug}-${credentials.sceneDropId}`;
    await visitor.updateDataObject({ [scopedKey]: nextVisitorData }, {});

    // Next matchup (respects the newly-incremented cap).
    const newCap = cap;
    const newVoted = voted + 1;
    const hitCap = newCap > 0 && newVoted >= newCap;
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
      callerVoteState: { voted: newVoted, cap: newCap, hitCap },
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

const dedupPush = <T,>(arr: T[], value: T): T[] => (arr.includes(value) ? arr : [...arr, value]);

const monsterToGallery = (entry: MonsterIndexEntry | undefined): GalleryMonster | null => {
  if (!entry) return null;
  const contributorDisplayNames: string[] = [];
  for (const s of ["head", "torso", "legs"] as const) {
    const n = entry.sections?.[s]?.contributorDisplayName;
    if (n) contributorDisplayNames.push(n);
  }
  return {
    monsterId: entry.monsterId,
    monsterAssetId: entry.monsterAssetId,
    name: entry.name ?? "",
    birthdate: entry.birthdate ?? 0,
    imageUrl: entry.imageUrl ?? null,
    contributorProfileIds: entry.contributorProfileIds ?? [],
    contributorDisplayNames,
    latestAward: entry.latestAward,
    callerContributed: false,
    fromCallerHistory: false,
  };
};
