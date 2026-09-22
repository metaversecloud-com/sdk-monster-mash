import { Request, Response } from "express";
import { KeyAssetDataObject, Section, SECTIONS } from "@shared/types/index.js";
import {
  errorHandler,
  getCredentials,
  getKeyAsset,
  getVisitor,
  transitionToDrawer,
} from "@utils/index.js";

/**
 * POST /api/monsters/:id/resume
 *
 * Triggers the modal → drawer iframe transition for a caller who's resuming
 * their active section. No state mutation — just verifies the caller
 * genuinely holds the lock on the given section and hands them the drawer.
 * Returns 409 if their `activeDraft` doesn't match, so the client can force
 * a re-fetch and re-render the Create tab.
 */
export const handleResumeSection = async (req: Request, res: Response) => {
  try {
    const source = req.body && req.body.interactiveNonce ? req.body : req.query;
    const credentials = getCredentials(source);
    const { profileId } = credentials;

    const monsterId = req.params.id;
    const section = req.body?.section as Section | undefined;
    if (!monsterId) return res.status(400).json({ success: false, message: "monsterId required" });
    if (!section || !SECTIONS.includes(section)) {
      return res.status(400).json({ success: false, message: "valid section required" });
    }

    const keyAsset = await getKeyAsset(credentials);
    const { visitor, visitorData } = await getVisitor(credentials);
    const dataObject = keyAsset.dataObject as KeyAssetDataObject;

    // Verify the caller genuinely holds this section (protects against stale
    // client state / rogue Resume clicks).
    const entry = dataObject.monsters?.[monsterId];
    if (!entry) return res.status(404).json({ success: false, message: "Monster not found." });
    const slot = entry.sections?.[section];
    if (!slot || slot.status !== "locked" || slot.contributorProfileId !== profileId) {
      return res.status(409).json({
        success: false,
        message: "You don't hold that section anymore — refresh Monster Mash.",
      });
    }
    const draft = visitorData.activeDraft;
    if (!draft || draft.monsterId !== monsterId || draft.section !== section) {
      return res.status(409).json({
        success: false,
        message: "Your active draft is different — refresh Monster Mash.",
      });
    }

    await transitionToDrawer({
      visitor,
      credentials,
      host: req.hostname,
      screen: "builder",
      params: { monsterId, section },
    });

    return res.json({ success: true, data: { monsterId, section } });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleResumeSection",
      message: "Error resuming section",
      req,
      res,
    });
  }
};
