import { Request, Response } from "express";
import { MIN_POOL_SIZE_FOR_VOTE, VOTING_CATEGORY_BY_ID } from "@shared/content/monsterMash.js";
import {
  GalleryMonster,
  KeyAssetDataObject,
  MonsterIndexEntry,
  StoredWinnerPayload,
  VoteMatchupPayload,
  VoteResponseData,
  VoteTabState,
} from "@shared/types/index.js";
import {
  computeVotedToday,
  contributorDisplayNamesFromEntry,
  errorHandler,
  getCredentials,
  getKeyAsset,
  getVisitor,
  pickMatchup,
} from "@utils/index.js";

/** Vote limit: `pool size × 1` per day (ET). No cycle cap. */
const DAILY_CAP_MULTIPLIER = 1;

/**
 * GET /api/vote
 *
 * Returns the Vote tab payload — state (scheduled|running|not-enough|voting-off),
 * category question, countdown target, winners row for last cycle, and the
 * next matchup pair for this caller.
 */
export const handleGetVote = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    const keyAsset = await getKeyAsset(credentials);
    const dataObject = keyAsset.dataObject as KeyAssetDataObject;
    const { visitorData } = await getVisitor(credentials);

    const cycle = dataObject.currentVoteCycle;
    const window = dataObject.currentSubmissionWindow;

    // Vote-cap accounting: ONE cap day (pool×1). Resets at
    // midnight ET on its own, and also on a new cycleId (admin force-start
    // or Sunday rollover) so a user who maxed out gets a fresh set when
    // the new cycle opens.
    const cycleId = cycle?.cycleId ?? "";
    const poolSizeNum = cycle ? cycle.poolMonsterIds.length : 0;
    const dailyCap = Math.max(0, poolSizeNum * DAILY_CAP_MULTIPLIER);
    const votedToday = computeVotedToday(visitorData, cycleId);
    const hitDailyCap = dailyCap > 0 && votedToday >= dailyCap;
    const hitCap = hitDailyCap;

    // Last winners row (for the top-right column in the mockup).
    const lastWinners = collectLastWinners(dataObject);

    let state: VoteTabState;
    let matchup: VoteMatchupPayload | null = null;
    let poolSize: number | undefined;
    let category: string | undefined;
    let categoryQuestion: string | undefined;
    let cycleEndsAt: number | undefined;
    let nextScheduledStartAt: number | undefined;

    if (!dataObject.weeklyVotingEnabled) {
      state = "voting-off";
    } else if (!cycle) {
      // No cycle running: either the prior window had too few monsters (state 3),
      // or we're mid-week waiting for Sunday (state 1). Sniff by looking at
      // whether the current submission window has ≥ MIN monsters yet.
      const eligibleCount = window?.eligibleMonsterIds?.length ?? 0;
      poolSize = eligibleCount;
      nextScheduledStartAt = window?.endAt ? window.endAt + 1 : undefined;
      if (eligibleCount < MIN_POOL_SIZE_FOR_VOTE) {
        state = "not-enough-monsters";
      } else {
        state = "scheduled";
      }
    } else {
      state = "running";
      poolSize = cycle.poolMonsterIds.length;
      category = cycle.category;
      categoryQuestion = VOTING_CATEGORY_BY_ID[cycle.category]?.question ?? cycle.category;
      cycleEndsAt = cycle.endAt;
      // Assemble the next matchup, unless caller hit cap.
      if (!hitCap) {
        matchup = buildMatchup(cycle, dataObject);
      }
    }

    const payload: VoteResponseData = {
      state,
      category,
      categoryQuestion,
      cycleEndsAt,
      poolSize,
      minPoolSize: MIN_POOL_SIZE_FOR_VOTE,
      nextScheduledStartAt,
      weeklyVotingEnabled: dataObject.weeklyVotingEnabled,
      matchup,
      lastWinners,
      callerVoteState: { votedToday, dailyCap, hitDailyCap, hitCap },
    };

    return res.json({ success: true, data: payload });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleGetVote",
      message: "Error loading vote state",
      req,
      res,
    });
  }
};

const buildMatchup = (
  cycle: NonNullable<KeyAssetDataObject["currentVoteCycle"]>,
  dataObject: KeyAssetDataObject,
): VoteMatchupPayload | null => {
  const raw = pickMatchup(cycle);
  if (!raw) return null;
  const [aId, bId] = raw.pair;
  const a = monsterToGallery(dataObject.monsters?.[aId]);
  const b = monsterToGallery(dataObject.monsters?.[bId]);
  if (!a || !b) return null;
  return { matchupId: raw.matchupId, pair: [a, b] };
};

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

const collectLastWinners = (dataObject: KeyAssetDataObject): StoredWinnerPayload[] => {
  const stored = dataObject.storedWinners ?? [];
  // Grab the most recent 3 (the "LAST WEEK'S WINNERS · CATEGORY" row).
  const tail = stored.slice(-3);
  return tail.map((w) => {
    const entry = dataObject.monsters?.[w.monsterId];
    const deleted = !entry;
    return {
      monsterId: w.monsterId,
      name: entry?.name ?? w.snapshotName ?? "",
      imageUrl: entry?.imageUrl ?? w.snapshotImageUrl ?? null,
      contributorDisplayNames: entry ? contributorDisplayNamesFromEntry(entry) : [],
      place: w.place,
      category: w.category,
      awardedAt: w.awardedAt,
      deleted,
    };
  });
};
