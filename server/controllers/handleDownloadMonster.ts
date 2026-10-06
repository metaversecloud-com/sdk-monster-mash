import { Request, Response } from "express";
import { errorHandler, getCredentials, getVisitor } from "@utils/index.js";

/**
 * POST /api/monsters/:id/download
 *
 * Fire-and-forget analytic hook from the Download PNG button. We don't gate
 * the actual download on this call (the `<a href>` opens the PNG in a new
 * tab via its own click handler); this endpoint only exists to classify the
 * click as own-vs-other based on whether the caller contributed to the
 * monster, using the caller's own visitor dataObject as the source of truth.
 */
export const handleDownloadMonster = async (req: Request, res: Response) => {
  try {
    const source = req.body && req.body.interactiveNonce ? req.body : req.query;
    const credentials = getCredentials(source);
    const { profileId, urlSlug } = credentials;

    const monsterId = req.params.id;
    if (!monsterId) return res.status(400).json({ success: false, message: "monsterId required" });

    const { visitor, visitorData } = await getVisitor(credentials);
    const contributed = !!visitorData.contributedMonsters?.[monsterId];
    const analyticName = contributed ? "monster_downloaded_own" : "monster_downloaded_other";

    await visitor
      .updateDataObject(
        {},
        {
          analytics: [
            {
              analyticName,
              profileId,
              urlSlug,
              uniqueKey: profileId,
            },
          ],
        },
      )
      .catch(() => {});

    return res.json({ success: true });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleDownloadMonster",
      message: "Error tracking monster download",
      req,
      res,
    });
  }
};
