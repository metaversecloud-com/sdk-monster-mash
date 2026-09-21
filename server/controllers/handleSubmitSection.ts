import { Request, Response } from "express";
import {
  InProgressSectionRecord,
  KeyAssetDataObject,
  MonsterMashVisitorData,
  Section,
  SECTIONS,
} from "@shared/types/index.js";
import {
  composeAndUploadSection,
  composeMonsterName,
  errorHandler,
  finalizeMonster,
  getBaseUrl,
  getCredentials,
  getKeyAsset,
  getVisitor,
  lockDataObject,
  validatePicks,
} from "@utils/index.js";

/**
 * POST /api/monsters/:id/section
 * Body: { section, picks, nameToken }
 *
 * Submit the caller's section. Server-side re-validates picks + name token,
 * composes and uploads a per-section PNG (so peer contributors can see the
 * finished art on the Create tab), writes the section record, flips the
 * roster slot done, and — when the third section lands — finalizes the
 * monster: full-monster compose + world drop + roster migration.
 *
 * `sectionImageUrl` and the finalize step are best-effort so a transient
 * S3 or SDK hiccup doesn't block a section submit; both errors are logged
 * and the record is still marked done.
 */
export const handleSubmitSection = async (req: Request, res: Response) => {
  try {
    const source = req.body && req.body.interactiveNonce ? req.body : req.query;
    const credentials = getCredentials(source);
    const { displayName, profileId, urlSlug, sceneDropId } = credentials;

    const monsterId = req.params.id;
    if (!monsterId) return res.status(400).json({ success: false, message: "monsterId required" });

    const section = req.body?.section as Section;
    const picks = (req.body?.picks ?? {}) as Record<string, string>;
    const nameToken = req.body?.nameToken as string;
    if (!SECTIONS.includes(section)) return res.status(400).json({ success: false, message: "valid section required" });

    const validation = validatePicks({ section, picks, nameToken });
    if (!validation.ok || !validation.normalizedPicks) {
      return res.status(400).json({ success: false, message: validation.error ?? "Invalid picks" });
    }

    const keyAsset = await getKeyAsset(credentials);
    const { visitor, visitorData } = await getVisitor(credentials, { shouldGetVisitorDetails: true });

    const now = Date.now();

    // Best-effort: compose + upload the per-section PNG BEFORE the DB write so
    // the recorded sectionImageUrl is durable. On failure, continue without.
    let sectionImageUrl: string | undefined;
    try {
      sectionImageUrl = await composeAndUploadSection(monsterId, section, validation.normalizedPicks);
    } catch (error) {
      errorHandler({
        error,
        functionName: "handleSubmitSection",
        message: "Non-fatal: section image compose/upload failed",
      });
    }

    const lockId = `${keyAsset.id}-submit-${monsterId}-${section}`;
    try {
      await lockDataObject(lockId, keyAsset);
    } catch (error) {
      return res.status(409).json({ success: false, message: "Submit collision — please retry." });
    }

    // Re-read under the lock.
    await keyAsset.fetchDataObject();
    const dataObject = keyAsset.dataObject as KeyAssetDataObject;
    const entry = dataObject.monsters?.[monsterId];
    if (!entry) {
      await keyAsset.updateDataObject({}, { lock: { lockId, releaseLock: true } }).catch(() => {});
      return res.status(404).json({ success: false, message: "Monster not found." });
    }
    const slot = entry.sections?.[section];
    if (!slot || slot.status !== "locked" || slot.contributorProfileId !== profileId) {
      await keyAsset.updateDataObject({}, { lock: { lockId, releaseLock: true } }).catch(() => {});
      return res.status(409).json({ success: false, message: "You don't hold the lock on this section." });
    }

    const record: InProgressSectionRecord = {
      contributorProfileId: profileId,
      contributorDisplayName: displayName,
      submittedAt: now,
      parts: validation.normalizedPicks,
      nameToken,
      sectionImageUrl,
    };

    const updatedSections = {
      ...entry.sections,
      [section]: {
        status: "done" as const,
        contributorProfileId: profileId,
        contributorDisplayName: displayName,
        submittedAt: now,
      },
    };
    const updatedInProgress = { ...(entry.inProgressSections ?? {}), [section]: record };
    const uniqueContributors = new Set([...(entry.contributorProfileIds ?? []), profileId]);

    // Detect completion (third section landing).
    const nowDone = SECTIONS.every((s) => updatedSections[s]?.status === "done");
    const patch: Record<string, unknown> = {
      [`monsters.${monsterId}.sections`]: updatedSections,
      [`monsters.${monsterId}.inProgressSections`]: updatedInProgress,
      [`monsters.${monsterId}.contributorProfileIds`]: Array.from(uniqueContributors),
      [`monsters.${monsterId}.lastEditedAt`]: now,
    };

    let composedName: string | undefined;
    if (nowDone) {
      composedName = composeMonsterName({
        ...entry,
        inProgressSections: updatedInProgress,
      });
      patch[`monsters.${monsterId}.state`] = "complete";
      patch[`monsters.${monsterId}.birthdate`] = now;
      patch[`monsters.${monsterId}.name`] = composedName;
    }

    await keyAsset.updateDataObject(patch, {
      lock: { lockId, releaseLock: true },
      analytics: [
        { analyticName: "section_submitted", profileId, urlSlug, uniqueKey: profileId },
        ...(nowDone ? [{ analyticName: "monster_completed", profileId, urlSlug, uniqueKey: monsterId }] : []),
      ],
    });

    // Third section — finalize (compose full monster, drop world asset, migrate roster).
    let finalizeResult: { imageUrl: string; monsterAssetId: string } | undefined;
    if (nowDone) {
      try {
        await keyAsset.fetchDataObject();
        const freshEntry = (keyAsset.dataObject as KeyAssetDataObject).monsters?.[monsterId];
        if (freshEntry) {
          const finalized = await finalizeMonster({
            credentials,
            keyAsset,
            visitor,
            monsterId,
            entry: freshEntry,
            clickableLinkBase: getBaseUrl(req.hostname),
          });
          finalizeResult = { imageUrl: finalized.imageUrl, monsterAssetId: finalized.monsterAssetId };
        }
      } catch (error) {
        errorHandler({
          error,
          functionName: "handleSubmitSection",
          message: "Non-fatal: monster finalize failed — admin can retry",
        });
      }
    }

    // Visitor: clear draft (if it matches), record contribution.
    const contribEntry: MonsterMashVisitorData["contributedMonsters"][string] = {
      section,
      submittedAt: now,
      ...(nowDone ? { completedAt: now } : {}),
    };
    const nextVisitorData: MonsterMashVisitorData = {
      ...visitorData,
      contributedMonsters: {
        ...visitorData.contributedMonsters,
        [monsterId]: {
          ...visitorData.contributedMonsters?.[monsterId],
          ...contribEntry,
        },
      },
    };
    const currentDraft = visitorData.activeDraft;
    if (currentDraft && currentDraft.monsterId === monsterId && currentDraft.section === section) {
      delete nextVisitorData.activeDraft;
    }

    const visitorKey = `${urlSlug}-${sceneDropId}`;
    await visitor.updateDataObject({ [visitorKey]: nextVisitorData }, {});

    return res.json({
      success: true,
      data: {
        monsterId,
        section,
        isComplete: nowDone,
        composedName: composedName ?? null,
        sectionImageUrl: sectionImageUrl ?? null,
        imageUrl: finalizeResult?.imageUrl ?? null,
        monsterAssetId: finalizeResult?.monsterAssetId ?? null,
      },
    });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleSubmitSection",
      message: "Error submitting section",
      req,
      res,
    });
  }
};
