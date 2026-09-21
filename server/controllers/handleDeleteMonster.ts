import { Request, Response } from "express";
import { UserInterface } from "@rtsdk/topia";
import {
  KeyAssetDataObject,
  MonsterMashVisitorData,
  VisitorDataObjectType,
} from "@shared/types/index.js";
import {
  errorHandler,
  getCredentials,
  getKeyAsset,
  getVisitor,
  User,
  World,
} from "@utils/index.js";

/**
 * DELETE /api/monsters/:id
 *
 * Admin-only. Removes a monster from the roster. Two branches:
 *   - in-progress  → drop from `monsters` map, clear each contributor's
 *                    `contributedMonsters[id]` (using `User` class for the
 *                    non-caller contributors, since we don't have their
 *                    visitorIds — spec §Visitor/User dataObject).
 *   - complete     → same fanout, plus:
 *                      · delete the monster's dropped asset from the world
 *                      · remove the id from `currentSubmissionWindow.eligibleMonsterIds`
 *                      · remove from `currentVoteCycle.poolMonsterIds` + `tallies`
 *                        (mockup image27's "if it's in this week's vote, it
 *                         will be disqualified")
 *
 * The dropped-asset delete is best-effort — the monster is removed from the
 * roster either way so an in-world orphan doesn't strand admin from a retry.
 */
export const handleDeleteMonster = async (req: Request, res: Response) => {
  try {
    const source = req.body && req.body.interactiveNonce ? req.body : req.query;
    const credentials = getCredentials(source);
    const { urlSlug } = credentials;
    const monsterId = req.params.id;
    if (!monsterId) return res.status(400).json({ success: false, message: "monsterId required" });

    // Admin gate.
    const keyAsset = await getKeyAsset(credentials);
    const { isAdmin } = await getVisitor(credentials, { shouldGetVisitorDetails: true });
    if (!isAdmin) return res.status(403).json({ success: false, message: "Admin only." });

    const dataObject = keyAsset.dataObject as KeyAssetDataObject;
    const entry = dataObject.monsters?.[monsterId];
    if (!entry) return res.status(404).json({ success: false, message: "Monster not found." });

    const contributorProfileIds = entry.contributorProfileIds ?? [];
    const monsterAssetId = entry.monsterAssetId;
    const isComplete = entry.state === "complete";

    // 1. Remove from roster + strip from window/cycle if applicable.
    const nextMonsters = { ...dataObject.monsters };
    delete nextMonsters[monsterId];

    const nextPatch: Record<string, unknown> = {
      monsters: nextMonsters,
    };
    if (dataObject.currentSubmissionWindow) {
      const nextWindow = {
        ...dataObject.currentSubmissionWindow,
        eligibleMonsterIds: (dataObject.currentSubmissionWindow.eligibleMonsterIds ?? []).filter(
          (id) => id !== monsterId,
        ),
      };
      nextPatch.currentSubmissionWindow = nextWindow;
    }
    if (dataObject.currentVoteCycle) {
      const nextTallies = { ...(dataObject.currentVoteCycle.tallies ?? {}) };
      delete nextTallies[monsterId];
      const nextCycle = {
        ...dataObject.currentVoteCycle,
        poolMonsterIds: (dataObject.currentVoteCycle.poolMonsterIds ?? []).filter((id) => id !== monsterId),
        tallies: nextTallies,
      };
      nextPatch.currentVoteCycle = nextCycle;
    }

    await keyAsset.updateDataObject(nextPatch, {
      analytics: [
        {
          analyticName: "monster_deleted",
          profileId: credentials.profileId,
          urlSlug,
          uniqueKey: `${credentials.profileId}-${monsterId}`,
        },
      ],
    });

    // 2. If completed, remove the dropped asset from the world (best-effort).
    if (isComplete && monsterAssetId) {
      try {
        await World.deleteDroppedAssets(
          urlSlug,
          [monsterAssetId],
          process.env.INTERACTIVE_SECRET || "",
          credentials,
        );
      } catch (error) {
        errorHandler({
          error,
          functionName: "handleDeleteMonster",
          message: `Non-fatal: could not delete monster dropped asset ${monsterAssetId}`,
        });
      }
    }

    // 3. Clear per-contributor `contributedMonsters[id]` on every contributor.
    // We only have their profileIds → reach for User (not Visitor), per the
    // Visitor/User memory: "User class for foreign-profile fanout writes".
    for (const profileId of contributorProfileIds) {
      try {
        const user: UserInterface = await User.create({ credentials: { ...credentials, profileId } });
        const raw = ((await user.fetchDataObject()) || {}) as VisitorDataObjectType;
        const scopedKey = `${credentials.urlSlug}-${credentials.sceneDropId}`;
        const scoped = raw[scopedKey] as MonsterMashVisitorData | undefined;
        if (!scoped) continue;
        const nextContrib = { ...scoped.contributedMonsters };
        delete nextContrib[monsterId];
        const patched: MonsterMashVisitorData = { ...scoped, contributedMonsters: nextContrib };
        await user.updateDataObject({ [scopedKey]: patched }, {});
      } catch (error) {
        errorHandler({
          error,
          functionName: "handleDeleteMonster",
          message: `Non-fatal: could not clear contributedMonsters for ${profileId}`,
        });
      }
    }

    return res.json({
      success: true,
      data: {
        monsterId,
        state: entry.state,
        contributorProfileIds,
        deletedDroppedAsset: !!monsterAssetId && isComplete,
      },
    });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleDeleteMonster",
      message: "Error deleting monster",
      req,
      res,
    });
  }
};
