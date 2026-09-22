import { randomUUID } from "crypto";
import { Request, Response } from "express";
import {
  KeyAssetDataObject,
  MonsterIndexEntry,
  MonsterMashVisitorData,
  Section,
  SectionRosterEntry,
  SECTIONS,
} from "@shared/types/index.js";
import {
  errorHandler,
  evictInProgressIfCapped,
  expireStaleLocks,
  getCredentials,
  getKeyAsset,
  getVisitor,
  pickRandomSection,
  transitionToDrawer,
} from "@utils/index.js";

/**
 * POST /api/monsters/start
 *
 * Start a new monster: allocate a monsterId, pick a random section, and
 * lock it for the caller. Other two sections are left `available` for
 * teammates. Also runs opportunistic 30-min lock expiry + IN_PROGRESS_CAP
 * eviction so the map never grows past 100.
 *
 * Refuses when the caller already has an `activeDraft` — the Create tab
 * should route them to Resume instead. Client can force through by first
 * abandoning the current draft.
 */
export const handleStartMonster = async (req: Request, res: Response) => {
  try {
    const source = req.body && req.body.interactiveNonce ? req.body : req.query;
    const credentials = getCredentials(source);
    const { displayName, profileId, urlSlug, sceneDropId } = credentials;

    const keyAsset = await getKeyAsset(credentials);
    const { visitor, visitorData } = await getVisitor(credentials);

    const now = Date.now();
    const dataObject = keyAsset.dataObject as KeyAssetDataObject;

    // Refuse if the visitor already has an unexpired active draft.
    const currentDraft = visitorData.activeDraft;
    if (currentDraft && dataObject.monsters?.[currentDraft.monsterId]) {
      return res.status(409).json({
        success: false,
        message: "You already have a section in progress — resume it or abandon it first.",
        activeDraft: currentDraft,
      });
    }

    // 1. Opportunistic 30-min stale-lock expiry.
    const expiry = expireStaleLocks(dataObject.monsters, now);
    // 2. Enforce in-progress cap, reserving one slot for the new monster.
    const eviction = evictInProgressIfCapped(expiry.monsters, true);
    let workingMonsters = eviction.monsters;

    const monsterId = randomUUID();
    const section = pickRandomSection(SECTIONS);
    if (!section) throw new Error("No sections available");

    const sectionsMap: Record<Section, SectionRosterEntry> = {
      head: { status: "available" },
      torso: { status: "available" },
      legs: { status: "available" },
    };
    sectionsMap[section] = {
      status: "locked",
      contributorProfileId: profileId,
      contributorDisplayName: displayName,
      lockedAt: now,
    };

    const entry: MonsterIndexEntry = {
      monsterId,
      state: "in-progress",
      createdAt: now,
      lastEditedAt: now,
      sections: sectionsMap,
      contributorProfileIds: [],
    };

    workingMonsters = { ...workingMonsters, [monsterId]: entry };

    // Single atomic write. The SDK's lock model is per-lockId: same lockId
    // serializes, different lockIds don't. We pick a lockId per-start-call
    // (unique per profile per `now`) — different callers race and one wins
    // per SDK convention. On failure we return 409 so the client can retry.
    const lockId = `${keyAsset.id}-start-${profileId}-${now}`;
    try {
      await keyAsset.updateDataObject(
        { monsters: workingMonsters },
        {
          lock: { lockId, releaseLock: true },
          analytics: [{ analyticName: "monster_started", profileId, urlSlug, uniqueKey: profileId }],
        },
      );
    } catch (error) {
      return res.status(409).json({
        success: false,
        message: "Try again in a moment — the roster was mid-update.",
      });
    }

    // Write the caller's activeDraft.
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
    await visitor.updateDataObject({ [visitorKey]: nextVisitorData }, {});

    // Modal → drawer transition: close the current (main-app modal) iframe
    // and open the Monster Builder in a fixed-width drawer. All credentials
    // are preserved via `buildAppUrl`.
    await transitionToDrawer({
      visitor,
      credentials,
      host: req.hostname,
      screen: "builder",
      params: { monsterId, section },
    });

    return res.json({ success: true, data: { monsterId, section, monster: entry } });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleStartMonster",
      message: "Error starting monster",
      req,
      res,
    });
  }
};
