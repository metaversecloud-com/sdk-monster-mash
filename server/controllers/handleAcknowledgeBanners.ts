import { Request, Response } from "express";
import { MonsterMashVisitorData } from "@shared/types/index.js";
import { errorHandler, getCredentials, getVisitor } from "@utils/index.js";

/**
 * POST /api/banners/acknowledge
 * Body: { win?: boolean, completion?: boolean }
 *
 * Clears the caller's pending banner queues once the client has surfaced
 * them (spec §Banner priority order: "shown until first viewed, then
 * cleared").
 */
export const handleAcknowledgeBanners = async (req: Request, res: Response) => {
  try {
    const source = req.body && req.body.interactiveNonce ? req.body : req.query;
    const credentials = getCredentials(source);
    const { visitor, visitorData } = await getVisitor(credentials);

    const clearWin = req.body?.win !== false;
    const clearCompletion = req.body?.completion !== false;

    const next: MonsterMashVisitorData = { ...visitorData };
    if (clearWin) next.pendingWinBanners = [];
    if (clearCompletion) next.pendingCompletionBanners = [];

    const scopedKey = `${credentials.urlSlug}-${credentials.sceneDropId}`;
    await visitor.updateDataObject({ [scopedKey]: next }, {});
    return res.json({ success: true, data: { cleared: { win: clearWin, completion: clearCompletion } } });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleAcknowledgeBanners",
      message: "Error acknowledging banners",
      req,
      res,
    });
  }
};
