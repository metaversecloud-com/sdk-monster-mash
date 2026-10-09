import { Request, Response } from "express";
import { errorHandler, getCredentials, getVisitor, transitionToMainApp } from "@utils/index.js";

/**
 * POST /api/main-app/return
 *
 * Drawer → wide modal transition. Client fires this whenever the user
 * clicks "Back to Monster Mash" from the Builder / Single Monster View /
 * Trophy drawer.
 *
 * No state mutation — just an iframe close + open pair. Best-effort: if
 * the SDK transition throws, we still return 200 so the client can navigate
 * as a fallback.
 */
export const handleReturnToMainApp = async (req: Request, res: Response) => {
  try {
    const source = req.body && req.body.interactiveNonce ? req.body : req.query;
    const credentials = getCredentials(source);
    const { visitor } = await getVisitor(credentials);

    await transitionToMainApp({
      visitor,
      credentials,
      host: req.hostname,
    });

    return res.json({ success: true });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleReturnToMainApp",
      message: "Error returning to Monster Mash",
      req,
      res,
    });
  }
};
