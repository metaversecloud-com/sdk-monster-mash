import { Request, Response } from "express";
import { GalleryMonster, KeyAssetDataObject, SingleMonsterResponseData } from "@shared/types/index.js";
import {
  contributorDisplayNamesFromEntry,
  errorHandler,
  getCredentials,
  getKeyAsset,
  getRibbonFromStoredWinners,
  getVisitor,
} from "@utils/index.js";

/**
 * GET /api/monsters/:id
 *
 * Payload for the Single Monster View drawer. Sources monster data from the
 * roster; when the monster has been evicted, falls back to the caller's
 * `visitorData.contributedMonsters` history. Admins see `canDelete: true`.
 */
export const handleGetMonster = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    const { profileId, urlSlug } = credentials;
    const monsterId = req.params.id;
    if (!monsterId) return res.status(400).json({ success: false, message: "monsterId required" });

    const keyAsset = await getKeyAsset(credentials);
    const dataObject = keyAsset.dataObject as KeyAssetDataObject;
    const { visitor, visitorData, isAdmin } = await getVisitor(credentials, { shouldGetVisitorDetails: true });

    const entry = dataObject.monsters?.[monsterId];
    const contribEntry = visitorData.contributedMonsters?.[monsterId];

    if (!entry && !contribEntry) {
      return res.status(404).json({ success: false, message: "Monster not found." });
    }

    const callerContributed = !!contribEntry;
    const monster: GalleryMonster = entry
      ? {
          monsterId,
          monsterAssetId: entry.monsterAssetId,
          name: entry.name ?? "",
          birthdate: entry.birthdate ?? 0,
          imageUrl: entry.imageUrl ?? null,
          contributorProfileIds: entry.contributorProfileIds ?? [],
          contributorDisplayNames: contributorDisplayNamesFromEntry(entry),
          latestAward: getRibbonFromStoredWinners(dataObject.storedWinners, monsterId),
          callerContributed,
          fromCallerHistory: false,
        }
      : {
          monsterId,
          monsterAssetId: contribEntry?.monsterAssetId,
          name: contribEntry?.name ?? "",
          birthdate: contribEntry?.birthdate ?? 0,
          imageUrl: contribEntry?.imageUrl ?? null,
          contributorProfileIds: contribEntry?.contributorProfileIds ?? [],
          contributorDisplayNames: contribEntry?.contributorDisplayNames ?? [],
          latestAward: (contribEntry?.awards ?? [])[0],
          callerContributed,
          fromCallerHistory: true,
        };

    // Fire the view analytic classified by caller contribution. Both the
    // in-world click (iframe → `/monsters/:id` directly) and the gallery
    // card click (`/monsters/:id/open` → iframe → `/monsters/:id`) funnel
    // through here, so firing once at this layer avoids double-counting.
    // Dedup per (profile, monster) — a user viewing the same monster
    // multiple times only counts once.
    await visitor
      .updateDataObject(
        {},
        {
          analytics: [
            {
              analyticName: callerContributed ? "monster_viewed_own" : "monster_viewed_other",
              profileId,
              urlSlug,
              uniqueKey: profileId,
            },
          ],
        },
      )
      .catch(() => {});

    const payload: SingleMonsterResponseData = {
      monster,
      canDelete: !!isAdmin,
    };

    return res.json({ success: true, data: payload });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleGetMonster",
      message: "Error getting monster",
      req,
      res,
    });
  }
};
