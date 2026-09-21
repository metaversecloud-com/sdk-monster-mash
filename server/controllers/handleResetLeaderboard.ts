import { Request, Response } from "express";
import { errorHandler, getCredentials, getKeyAsset, getVisitor } from "@utils/index.js";

/**
 * POST /api/leaderboard/reset
 *
 * Admin-only. Wipes the trophy leaderboard cache (award counts + monsters-
 * built counters). Badges are NOT affected — the spec is explicit that
 * reset only touches counters (mockup image30 body).
 */
export const handleResetLeaderboard = async (req: Request, res: Response) => {
  try {
    const source = req.body && req.body.interactiveNonce ? req.body : req.query;
    const credentials = getCredentials(source);
    const { profileId, urlSlug } = credentials;
    const keyAsset = await getKeyAsset(credentials);
    const { isAdmin } = await getVisitor(credentials, { shouldGetVisitorDetails: true });
    if (!isAdmin) return res.status(403).json({ success: false, message: "Admin only." });

    await keyAsset.updateDataObject(
      { trophyLeaderboard: {} },
      {
        analytics: [
          {
            analyticName: "leaderboard_reset",
            profileId,
            urlSlug,
            uniqueKey: `${profileId}-${Date.now()}`,
          },
        ],
      },
    );
    return res.json({ success: true, data: { leaderboard: [] } });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleResetLeaderboard",
      message: "Error resetting leaderboard",
      req,
      res,
    });
  }
};
