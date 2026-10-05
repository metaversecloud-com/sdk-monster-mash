import { Request, Response } from "express";
import { LEADERBOARD_CAP } from "@shared/content/monsterMash.js";
import { KeyAssetDataObject, TrophyBadgeRow, TrophyLeaderboardRow, TrophyResponseData } from "@shared/types/index.js";
import {
  errorHandler,
  getBadgeCatalog,
  getCredentials,
  getKeyAsset,
  getVisitor,
  parseLeaderboardRow,
  syncBadges,
} from "@utils/index.js";

/**
 * GET /api/trophy
 *
 * Returns the leaderboard (top 25 + caller's row if outside top 25) + the
 * badge grid (four groups, with owned flags). The badge catalog comes from
 * the ecosystem inventory — art, grouping and order all live on each BADGE
 * item's metadata, so adding badges is an inventory import, not a deploy.
 */
export const handleGetTrophy = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    const forceRefreshInventory = req.query.forceRefreshInventory === "true";

    const keyAsset = await getKeyAsset(credentials);
    const dataObject = keyAsset.dataObject as KeyAssetDataObject;
    const { visitor, isAdmin, visitorData, visitorInventory } = await getVisitor(credentials, {
      shouldGetVisitorDetails: true,
      includeInventory: true,
      forceRefreshInventory,
    });

    // Sort leaderboard: awards desc → monstersContributedTo desc → displayName asc.
    // Rows are compact pipe-joined strings on disk; parse once before sorting.
    const rows = Object.entries(dataObject.leaderboard ?? {})
      .map(([profileId, row]) => ({ profileId, ...parseLeaderboardRow(row) }))
      .sort((a, b) => {
        if (b.awardsWon !== a.awardsWon) return b.awardsWon - a.awardsWon;
        if (b.monstersContributedTo !== a.monstersContributedTo)
          return b.monstersContributedTo - a.monstersContributedTo;
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

    // Grant anything newly earned before building the grid, so opening the
    // Trophy drawer shows the badge you just qualified for rather than one
    // open behind. `syncBadges` adds the granted names to `ownedNames`.
    const ownedNames = new Set(Object.keys(visitorInventory ?? {}));
    await syncBadges({ credentials, visitor, visitorData, ownedBadgeNames: ownedNames, forceRefreshInventory });

    // Badges: the ecosystem catalog is the full grid; the visitor's own
    // inventory only says which of them are owned. Prefer the visitor's copy
    // of the art when present, else fall back to the catalog art.
    const catalog = await getBadgeCatalog(credentials, { forceRefresh: forceRefreshInventory });
    const badges: TrophyBadgeRow[] = catalog.map((b) => ({
      name: b.displayName,
      group: b.group,
      owned: ownedNames.has(b.name),
      iconUrl: visitorInventory?.[b.name]?.icon || b.iconUrl || undefined,
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
