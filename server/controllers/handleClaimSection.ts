import { Request, Response } from "express";
import {
  KeyAssetDataObject,
  MonsterMashVisitorData,
  Section,
  SECTIONS,
} from "@shared/types/index.js";
import {
  errorHandler,
  expireStaleLocks,
  getCredentials,
  getKeyAsset,
  getVisitor,
  lockDataObject,
} from "@utils/index.js";

/**
 * POST /api/monsters/:id/claim
 * Body: { section: "head" | "torso" | "legs" }
 *
 * Player joins an in-progress monster by claiming its still-`available`
 * section. Refuses with 409 if:
 *   - the monster doesn't exist / is already complete
 *   - the claimed section is not currently `available`
 *   - the caller already has an unexpired activeDraft
 * The 409 is what fires the "Oops, that one was just claimed" race dialog
 * on the client (mockup image12).
 */
export const handleClaimSection = async (req: Request, res: Response) => {
  try {
    const source = req.body && req.body.interactiveNonce ? req.body : req.query;
    const credentials = getCredentials(source);
    const { displayName, profileId, urlSlug, sceneDropId } = credentials;
    const monsterId = req.params.id;
    const section = req.body?.section as Section;

    if (!monsterId) return res.status(400).json({ success: false, message: "monsterId required" });
    if (!section || !SECTIONS.includes(section)) {
      return res.status(400).json({ success: false, message: "valid section required" });
    }

    const keyAsset = await getKeyAsset(credentials);
    const { visitor, visitorData } = await getVisitor(credentials);

    const now = Date.now();
    const dataObject = keyAsset.dataObject as KeyAssetDataObject;

    const currentDraft = visitorData.activeDraft;
    if (currentDraft && dataObject.monsters?.[currentDraft.monsterId]) {
      return res.status(409).json({
        success: false,
        message: "You already have a section in progress.",
        activeDraft: currentDraft,
      });
    }

    // Opportunistic expiry so a lock that lapsed a moment ago doesn't stall the claim.
    const expiry = expireStaleLocks(dataObject.monsters, now);
    const monsters = expiry.monsters;
    const entry = monsters[monsterId];
    if (!entry) return res.status(404).json({ success: false, message: "Monster not found." });
    if (entry.state === "complete") {
      return res.status(409).json({ success: false, message: "Monster is already complete." });
    }
    if (entry.sections?.[section]?.status !== "available") {
      return res.status(409).json({ success: false, message: "Section is not available." });
    }

    const lockId = `${keyAsset.id}-claim-${monsterId}-${section}`;
    try {
      await lockDataObject(lockId, keyAsset);
    } catch (error) {
      return res.status(409).json({ success: false, message: "That section was just claimed by someone else." });
    }

    // Re-verify under the lock (the pre-lock read may be stale).
    await keyAsset.fetchDataObject();
    const freshEntry = (keyAsset.dataObject as KeyAssetDataObject).monsters?.[monsterId];
    if (!freshEntry || freshEntry.sections?.[section]?.status !== "available") {
      // Release the lock we just took, no-op write.
      await keyAsset.updateDataObject({}, { lock: { lockId, releaseLock: true } }).catch(() => {});
      return res.status(409).json({ success: false, message: "That section was just claimed by someone else." });
    }

    const updatedSections = {
      ...freshEntry.sections,
      [section]: {
        status: "locked" as const,
        contributorProfileId: profileId,
        contributorDisplayName: displayName,
        lockedAt: now,
      },
    };
    const patch = {
      [`monsters.${monsterId}.sections`]: updatedSections,
      [`monsters.${monsterId}.lastEditedAt`]: now,
    };

    await keyAsset.updateDataObject(patch, { lock: { lockId, releaseLock: true } });

    const nextVisitorData: MonsterMashVisitorData = {
      ...visitorData,
      activeDraft: {
        monsterId,
        section,
        lockedAt: now,
        lastActivityAt: now,
        picks: {},
      },
    };
    const visitorKey = `${urlSlug}-${sceneDropId}`;
    await visitor.updateDataObject(
      { [visitorKey]: nextVisitorData },
      {
        analytics: [
          { analyticName: "section_claimed", profileId, urlSlug, uniqueKey: profileId },
        ],
      },
    );

    return res.json({ success: true, data: { monsterId, section } });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleClaimSection",
      message: "Error claiming section",
      req,
      res,
    });
  }
};
