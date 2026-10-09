import { Request, Response } from "express";
import { KeyAssetDataObject, MonsterMashVisitorData, Section, SECTIONS } from "@shared/types/index.js";
import {
  errorHandler,
  expireStaleLocks,
  getCredentials,
  getKeyAsset,
  getVisitor,
  transitionToDrawer,
} from "@utils/index.js";

/**
 * POST /api/monsters/:id/claim
 * Body: { section: "head" | "torso" | "legs" }
 *
 * Refuses with 409 if:
 *   - the monster doesn't exist / is already complete
 *   - the claimed section is not currently `available` and belongs to
 *     someone else
 *   - the caller already has an unexpired activeDraft on a DIFFERENT monster
 *   - the caller has ALREADY contributed a section to this same monster
 * The 409 is what fires the "Oops, that one was just claimed" race dialog
 * on the client.
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

    // Idempotent re-claim: caller's activeDraft already points at this exact
    // (monster, section). Two ways to land here:
    //   1. They closed the drawer without submitting and clicked Join again.
    //   2. A stale-consistency read on a prior /main-app flipped the section
    //      back to `available` on the wire even though they still hold it.
    // Either way: re-establish the lock (if drifted), refresh the visitor
    // lastActivityAt, and transition them into the drawer - no need to
    // gate on "you already have a draft" (that's them).
    if (currentDraft && currentDraft.monsterId === monsterId && currentDraft.section === section) {
      const entry = dataObject.monsters?.[monsterId];
      if (!entry) return res.status(404).json({ success: false, message: "Monster not found." });
      if (entry.state === "complete") {
        return res.status(409).json({ success: false, message: "Monster is already complete." });
      }
      const currentSlot = entry.sections?.[section];
      const heldBySomeoneElse =
        currentSlot?.status === "locked" &&
        currentSlot.contributorProfileId &&
        currentSlot.contributorProfileId !== profileId;
      if (heldBySomeoneElse) {
        return res.status(409).json({ success: false, message: "Section was taken by someone else." });
      }

      // Rewrite the slot as locked-to-us (idempotent if already correct).
      const updatedSections = {
        ...entry.sections,
        [section]: {
          status: "locked" as const,
          contributorProfileId: profileId,
          contributorDisplayName: displayName,
          lockedAt: currentSlot?.status === "locked" ? currentSlot.lockedAt ?? now : now,
        },
      };
      await keyAsset.updateDataObject(
        {
          [`monsters.${monsterId}.sections`]: updatedSections,
          [`monsters.${monsterId}.lastEditedAt`]: now,
        },
        {
          lock: {
            lockId: `${keyAsset.id}-claim-${monsterId}-${section}-${Math.round(Date.now() / 5000) * 5000}`,
            releaseLock: true,
          },
        },
      );

      // Refresh caller lastActivityAt in the same visitor write.
      const visitorKey = `${urlSlug}-${sceneDropId}`;
      await visitor.updateDataObject(
        {
          [`${visitorKey}.activeDraft`]: { ...currentDraft, lastActivityAt: now, joined: true },
        },
        {},
      );

      await transitionToDrawer({
        visitor,
        credentials,
        host: req.hostname,
        screen: "builder",
        params: { monsterId, section },
      });
      return res.json({ success: true, data: { monsterId, section, resumed: true } });
    }

    // Caller has a DIFFERENT active draft - refuse.
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
    if ((entry.contributorProfileIds ?? []).includes(profileId)) {
      return res.status(409).json({
        success: false,
        message: "You've already contributed a section to this monster.",
      });
    }

    // Re-verify section is available
    await keyAsset.fetchDataObject();
    const freshEntry = (keyAsset.dataObject as KeyAssetDataObject).monsters?.[monsterId];
    if (!freshEntry || freshEntry.sections?.[section]?.status !== "available") {
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

    await keyAsset.updateDataObject(patch, {
      lock: {
        lockId: `${keyAsset.id}-claim-${monsterId}-${section}-${Math.round(Date.now() / 5000) * 5000}`,
        releaseLock: true,
      },
    });

    const nextVisitorData: MonsterMashVisitorData = {
      ...visitorData,
      activeDraft: {
        monsterId,
        section,
        lockedAt: now,
        lastActivityAt: now,
        picks: {},
        // Claiming is how you join a monster someone else started. Carried
        // onto contributedMonsters at submit so Lab Partner only counts
        // joins that were finished, not claim-then-abandon.
        joined: true,
      },
    };
    const visitorKey = `${urlSlug}-${sceneDropId}`;
    // Count how many sections are now on-board for THIS monster (locked +
    // done). The claim we just wrote is included, so the count becomes the
    // 1/2/3 ordinal: 1 = this is the first section anyone's holding (rare
    // — only after an abandon chain), 2 = joined a monster that already had
    // one section in play, 3 = the final section landing. Clamp defensively
    // so a roster shape mismatch can't send a stray `section_claimed_0`.
    const sectionsOnBoard = Object.values(updatedSections).filter(
      (s) => s.status === "locked" || s.status === "done",
    ).length;
    const claimOrder = Math.min(3, Math.max(1, sectionsOnBoard));
    await visitor.updateDataObject(
      { [visitorKey]: nextVisitorData },
      {
        analytics: [
          {
            analyticName: `section_claimed_${claimOrder}`,
            profileId,
            urlSlug,
            uniqueKey: profileId,
          },
        ],
      },
    );

    // Modal → drawer transition: same pattern as Create.
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
      functionName: "handleClaimSection",
      message: "Error claiming section",
      req,
      res,
    });
  }
};
