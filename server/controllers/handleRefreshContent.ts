import { Request, Response } from "express";
import { errorHandler, getCredentials, getVisitor, refreshContent } from "@utils/index.js";

/**
 * POST /api/content/refresh
 *
 * Admin-only. Busts the memoized parts catalog + re-runs the S3 load so new
 * uploads land without a server restart. Returns the fresh part count grouped
 * by category so the caller can smoke-test the upload.
 */
export const handleRefreshContent = async (req: Request, res: Response) => {
  try {
    const source = req.body && req.body.interactiveNonce ? req.body : req.query;
    const credentials = getCredentials(source);
    const { isAdmin } = await getVisitor(credentials, { shouldGetVisitorDetails: true });
    if (!isAdmin) return res.status(403).json({ success: false, message: "Admin only." });

    const content = refreshContent();
    const counts: Record<string, number> = {};
    for (const p of content.parts) counts[p.categoryId] = (counts[p.categoryId] ?? 0) + 1;
    return res.json({
      success: true,
      data: {
        loadedAt: content.loadedAt,
        totalParts: content.parts.length,
        countsByCategory: counts,
      },
    });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleRefreshContent",
      message: "Error refreshing content",
      req,
      res,
    });
  }
};
