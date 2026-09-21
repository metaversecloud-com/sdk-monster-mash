import { Request, Response } from "express";
import { KeyAssetDataObject, MonsterMashVisitorData } from "@shared/types/index.js";
import {
  errorHandler,
  getCredentials,
  getKeyAsset,
  getVisitor,
  lockDataObject,
} from "@utils/index.js";

/**
 * POST /api/monsters/:id/abandon
 *
 * Player releases their claim on a section. Idempotent: if the caller
 * doesn't hold the lock, we still clear their activeDraft (they've closed
 * the drawer) and reply success.
 */
export const handleAbandonSection = async (req: Request, res: Response) => {
  try {
    const source = req.body && req.body.interactiveNonce ? req.body : req.query;
    const credentials = getCredentials(source);
    const { profileId, urlSlug, sceneDropId } = credentials;
    const monsterId = req.params.id;
    if (!monsterId) return res.status(400).json({ success: false, message: "monsterId required" });

    const keyAsset = await getKeyAsset(credentials);
    const { visitor, visitorData } = await getVisitor(credentials);
    const dataObject = keyAsset.dataObject as KeyAssetDataObject;
    const entry = dataObject.monsters?.[monsterId];

    // Match by (caller holds the lock) AND (draft points at this monster).
    let releasedSection: string | null = null;
    if (entry) {
      for (const section of Object.keys(entry.sections ?? {})) {
        const slot = entry.sections?.[section as keyof typeof entry.sections];
        if (slot?.status === "locked" && slot.contributorProfileId === profileId) {
          releasedSection = section;
          break;
        }
      }
    }

    if (releasedSection) {
      const lockId = `${keyAsset.id}-abandon-${monsterId}-${releasedSection}`;
      try {
        await lockDataObject(lockId, keyAsset);
      } catch (error) {
        // Someone else is mid-update on this monster — try again shortly.
        return res.status(409).json({ success: false, message: "Try abandoning again in a moment." });
      }

      const updatedSections = {
        ...entry!.sections,
        [releasedSection]: { status: "available" as const },
      };
      await keyAsset.updateDataObject(
        {
          [`monsters.${monsterId}.sections`]: updatedSections,
          [`monsters.${monsterId}.lastEditedAt`]: Date.now(),
        },
        { lock: { lockId, releaseLock: true } },
      );
    }

    // Always clear the visitor's activeDraft if it points here.
    const nextVisitorData: MonsterMashVisitorData = { ...visitorData };
    const draft = visitorData.activeDraft;
    if (draft && draft.monsterId === monsterId) {
      delete nextVisitorData.activeDraft;
    }
    const visitorKey = `${urlSlug}-${sceneDropId}`;
    await visitor.updateDataObject(
      { [visitorKey]: nextVisitorData },
      {
        analytics: [
          { analyticName: "section_abandoned", profileId, urlSlug, uniqueKey: profileId },
        ],
      },
    );

    return res.json({ success: true, data: { released: releasedSection } });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleAbandonSection",
      message: "Error abandoning section",
      req,
      res,
    });
  }
};
