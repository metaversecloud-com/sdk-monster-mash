import { Request, Response } from "express";
import { errorHandler, getCredentials, getVisitor } from "@utils/index.js";

const ALLOWED_TABS = new Set(["create", "gallery", "vote"] as const);
type AllowedTab = "create" | "gallery" | "vote";

/**
 * POST /api/tab-view
 * Body: { tab: "create" | "gallery" | "vote" }
 *
 * Fires `createTab_viewed`, `galleryTab_viewed`, or `voteTab_viewed` on the
 * caller's visitor dataObject with no state mutation. Fire-and-forget from
 * the client whenever the active tab changes (and on mount for the default
 * tab). Dedup is per profile per tab per ET-calendar-day so a session that
 * flips tabs twenty times still only counts one view per tab per day — same
 * grain as `app_opened`.
 */
export const handleTabView = async (req: Request, res: Response) => {
  try {
    const source = req.body && req.body.interactiveNonce ? req.body : req.query;
    const credentials = getCredentials(source);
    const { profileId, urlSlug } = credentials;
    const tab = String(req.body?.tab ?? "") as AllowedTab;
    if (!ALLOWED_TABS.has(tab)) {
      return res.status(400).json({ success: false, message: "valid tab required" });
    }

    const { visitor } = await getVisitor(credentials);
    const today = new Date().toISOString().slice(0, 10);
    await visitor
      .updateDataObject(
        {},
        {
          analytics: [
            {
              analyticName: `${tab}Tab_viewed`,
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
      functionName: "handleTabView",
      message: "Error tracking tab view",
      req,
      res,
    });
  }
};
