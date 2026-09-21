import { Request, Response } from "express";
import { LEADERBOARD_CAP } from "@shared/content/monsterMash.js";
import { BADGES } from "@shared/content/badges.js";
import {
  KeyAssetDataObject,
  TrophyBadgeRow,
  TrophyLeaderboardRow,
  TrophyResponseData,
} from "@shared/types/index.js";
import { errorHandler, getCredentials, getKeyAsset, getVisitor } from "@utils/index.js";

/**
 * GET /api/trophy
 *
 * Returns the leaderboard (top 25 + caller's row if outside top 25) + the
 * badge grid (four groups × 38 badges with owned flags). Client renders
 * both tabs in the Trophy drawer (mockup images 21 / 24).
 */
export const handleGetTrophy = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    const forceRefreshInventory = req.query.forceRefreshInventory === "true";

    const keyAsset = await getKeyAsset(credentials);
    const dataObject = keyAsset.dataObject as KeyAssetDataObject;
    const { isAdmin, visitorInventory } = await getVisitor(credentials, {
      shouldGetVisitorDetails: true,
      includeInventory: true,
      forceRefreshInventory,
    });

    // Sort leaderboard: awards desc → monstersContributedTo desc → displayName asc.
    const rows = Object.entries(dataObject.trophyLeaderboard ?? {})
      .map(([profileId, row]) => ({ profileId, ...row }))
      .sort((a, b) => {
        if (b.awardsWon !== a.awardsWon) return b.awardsWon - a.awardsWon;
        if (b.monstersContributedTo !== a.monstersContributedTo) return b.monstersContributedTo - a.monstersContributedTo;
        return a.displayName.localeCompare(b.displayName);
      });

    const ranked: TrophyLeaderboardRow[] = rows.map((r, idx) => ({
      rank: idx + 1,
      profileId: r.profileId,
      displayName: r.displayName || r.profileId,
      awardsWon: r.awardsWon,
      monstersContributedTo: r.monstersContributedTo,
      isCaller: r.profileId === credentials.profileId,
    }));

    const top = ranked.slice(0, LEADERBOARD_CAP);
    const callerRow = ranked.find((r) => r.isCaller && r.rank > LEADERBOARD_CAP);

    // Badges: mark owned by name lookup against ecosystem visitor inventory.
    const ownedNames = new Set(Object.keys(visitorInventory ?? {}));
    const badges: TrophyBadgeRow[] = BADGES.map((b) => ({
      name: b.name,
      group: b.group,
      owned: ownedNames.has(b.name),
      iconUrl: visitorInventory?.[b.name]?.icon,
    }));

    const payload: TrophyResponseData = {
      leaderboard: top,
      callerRow,
      cap: LEADERBOARD_CAP,
      badges,
      ownedBadgesCount: badges.filter((b) => b.owned).length,
      totalBadges: badges.length,
      isAdmin,
    };
    return res.json({ success: true, data: payload });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleGetTrophy",
      message: "Error getting trophy",
      req,
      res,
    });
  }
};
