import { Request, Response } from "express";
import { KeyAssetDataObject } from "@shared/types/index.js";
import { errorHandler, getCredentials, getKeyAsset, getVisitor } from "@utils/index.js";

/**
 * PUT /api/admin/settings
 * Body: { weeklyVotingEnabled: boolean }
 *
 * Admin-only. Flips the weekly-voting toggle in the key asset. When turning
 * OFF while a cycle is running, the current cycle is nulled out in the same
 * write — no winners awarded, no completion analytics, per plan §10.13
 * ("the current vote will end right away and no awards will be given for it").
 * Turning voting back ON does NOT immediately open a vote; the next Sunday
 * rollover in `advanceWeeklyCycle` will do that when there's a pool.
 *
 * Single `updateDataObject` per the "one write per controller per dataObject"
 * rule.
 */
export const handleUpdateAdminSettings = async (req: Request, res: Response) => {
  try {
    const source = req.body && req.body.interactiveNonce ? req.body : req.query;
    const credentials = getCredentials(source);
    const { urlSlug, profileId } = credentials;

    const weeklyVotingEnabled = req.body?.weeklyVotingEnabled;
    if (typeof weeklyVotingEnabled !== "boolean") {
      return res.status(400).json({ success: false, message: "weeklyVotingEnabled (boolean) required" });
    }

    const { isAdmin } = await getVisitor(credentials, { shouldGetVisitorDetails: true });
    if (!isAdmin) return res.status(403).json({ success: false, message: "Admin only." });

    const keyAsset = await getKeyAsset(credentials);
    const dataObject = keyAsset.dataObject as KeyAssetDataObject;

    // No-op guard.
    if (dataObject.weeklyVotingEnabled === weeklyVotingEnabled) {
      return res.json({
        success: true,
        data: { weeklyVotingEnabled, endedVote: false },
      });
    }

    const patch: Record<string, unknown> = { weeklyVotingEnabled };

    // Turning OFF while a cycle is running — end it right away, no awards.
    let endedVote = false;
    if (!weeklyVotingEnabled && dataObject.currentVoteCycle) {
      patch.currentVoteCycle = null;
      endedVote = true;
    }

    await keyAsset.updateDataObject(patch, {
      analytics: [
        {
          analyticName: weeklyVotingEnabled ? "voting_enabled" : "voting_disabled",
          profileId,
          urlSlug,
          uniqueKey: profileId,
        },
      ],
    });

    return res.json({ success: true, data: { weeklyVotingEnabled, endedVote } });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleUpdateAdminSettings",
      message: "Error updating admin settings",
      req,
      res,
    });
  }
};
