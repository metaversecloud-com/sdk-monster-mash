import { Request, Response } from "express";
import {
  KeyAssetDataObject,
  MonsterMashVisitorData,
  Section,
  SECTIONS,
} from "@shared/types/index.js";
import {
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
 * marks the roster slot done, and stores the caller's picks/nameToken under
 * their visitor `contributedDrafts[monsterId][section]` so the client can
 * render a layered preview of *their own* completed sections until the
 * monster finalizes.
 *
 * No per-section image is composed or uploaded — the only S3 upload happens
 * on the third-section submit, when finalize runs. The key asset roster no
 * longer stores per-section pick data at all (see `KeyAssetData.ts` note).
 *
 * On the third submit finalize composes the full monster, drops the world
 * asset, and — critically — clears `contributedDrafts[monsterId]` from
 * every contributor so long-term visitor dataObjects stay lean.
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

    const validation = await validatePicks({ section, picks, nameToken });
    if (!validation.ok || !validation.normalizedPicks) {
      return res.status(400).json({ success: false, message: validation.error ?? "Invalid picks" });
    }

    const keyAsset = await getKeyAsset(credentials);
    const { visitor, visitorData } = await getVisitor(credentials, { shouldGetVisitorDetails: true });

    const now = Date.now();

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
      // We already hold `lockId`; don't re-acquire to release. TTL clears it.
      return res.status(404).json({ success: false, message: "Monster not found." });
    }
    const slot = entry.sections?.[section];
    if (!slot || slot.status !== "locked" || slot.contributorProfileId !== profileId) {
      return res.status(409).json({ success: false, message: "You don't hold the lock on this section." });
    }

    const updatedSections = {
      ...entry.sections,
      [section]: {
        status: "done" as const,
        contributorProfileId: profileId,
        contributorDisplayName: displayName,
        submittedAt: now,
      },
    };
    const uniqueContributors = new Set([...(entry.contributorProfileIds ?? []), profileId]);

    // Detect completion (third section landing).
    const nowDone = SECTIONS.every((s) => updatedSections[s]?.status === "done");
    const patch: Record<string, unknown> = {
      [`monsters.${monsterId}.sections`]: updatedSections,
      [`monsters.${monsterId}.contributorProfileIds`]: Array.from(uniqueContributors),
      [`monsters.${monsterId}.lastEditedAt`]: now,
    };

    // Third section — finalize (compose full monster, drop world asset). The
    // finalize call returns the roster/window patch AND the caller's
    // contributedMonsters enrichment instead of writing them itself. Both get
    // merged into our single keyAsset + single visitor writes below (per the
    // "one updateDataObject per controller per dataObject" rule).
    //
    // Finalize also fetches each PEER's contributedDrafts to gather their
    // picks + name tokens (they're no longer on the roster), composes the
    // final image, and cleans up peers' contributedDrafts[monsterId] in the
    // same visitor writes it already does for contributedMonsters + banners.
    let composedName: string | undefined;
    let finalizeResult: { imageUrl: string | null; monsterAssetId: string | null } | undefined;
    let finalizeCallerContribution:
      | Partial<MonsterMashVisitorData["contributedMonsters"][string]>
      | undefined;
    if (nowDone) {
      try {
        const finalized = await finalizeMonster({
          credentials,
          keyAsset,
          visitor,
          monsterId,
          entry: {
            ...entry,
            sections: updatedSections,
            contributorProfileIds: Array.from(uniqueContributors),
            lastEditedAt: now,
          },
          callerSection: section,
          callerPicks: validation.normalizedPicks,
          callerNameToken: nameToken,
          clickableLinkBase: getBaseUrl(req.hostname),
        });
        composedName = finalized.composedName;
        finalizeResult = { imageUrl: finalized.imageUrl, monsterAssetId: finalized.monsterAssetId };
        finalizeCallerContribution = finalized.callerContribution;
        // Merge finalize's roster + window patch into our upcoming write.
        // `monsters` from finalize supersedes the dot-path monster edits above
        // (they were section-scoped; finalize now owns the whole roster shape).
        delete patch[`monsters.${monsterId}.sections`];
        delete patch[`monsters.${monsterId}.contributorProfileIds`];
        delete patch[`monsters.${monsterId}.lastEditedAt`];
        Object.assign(patch, finalized.keyAssetPatch);
      } catch (error) {
        errorHandler({
          error,
          functionName: "handleSubmitSection",
          message: "Non-fatal: monster finalize failed — admin can retry",
        });
        // Finalize failed but sections are all done. Mark complete anyway so
        // the UI + roster reflect reality; imageUrl / monsterAssetId stay
        // undefined and clients render the "world drop queued" placeholder.
        patch[`monsters.${monsterId}.state`] = "complete";
        patch[`monsters.${monsterId}.birthdate`] = now;
      }
    }

    // Single keyAsset write. We already hold `lockId` (from lockDataObject
    // above); plain update matches tic-tac-toe's pattern — re-passing lock
    // triggers "data object busy".
    await keyAsset.updateDataObject(patch, {
      analytics: [
        { analyticName: "section_submitted", profileId, urlSlug, uniqueKey: profileId },
        ...(nowDone ? [{ analyticName: "monster_completed", profileId, urlSlug, uniqueKey: monsterId }] : []),
      ],
    });

    // Single visitor write. Combines four things in one patch:
    //   1. Drop activeDraft (the lock is spent)
    //   2. Add/refresh the caller's contributedMonsters entry (+ finalize
    //      enrichment when we just completed)
    //   3. Save this section's picks/nameToken into contributedDrafts so the
    //      client can render a layered preview until finalize (or clean the
    //      whole monster out of contributedDrafts if we just finalized)
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
          ...(finalizeCallerContribution ?? {}),
        },
      },
    };
    const currentDraft = visitorData.activeDraft;
    if (currentDraft && currentDraft.monsterId === monsterId && currentDraft.section === section) {
      delete nextVisitorData.activeDraft;
    }

    const nextDrafts = { ...(visitorData.contributedDrafts ?? {}) };
    if (nowDone) {
      // Monster finalized — no need to keep the caller's picks around.
      delete nextDrafts[monsterId];
    } else {
      nextDrafts[monsterId] = {
        ...(nextDrafts[monsterId] ?? {}),
        [section]: { picks: validation.normalizedPicks, nameToken },
      };
    }
    nextVisitorData.contributedDrafts = nextDrafts;

    const visitorKey = `${urlSlug}-${sceneDropId}`;
    await visitor.updateDataObject({ [visitorKey]: nextVisitorData }, {});

    return res.json({
      success: true,
      data: {
        monsterId,
        section,
        isComplete: nowDone,
        composedName: composedName ?? null,
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
