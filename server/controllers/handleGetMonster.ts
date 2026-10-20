import { Request, Response } from "express";
import {
  GalleryMonster,
  KeyAssetDataObject,
  MonsterAssetDataObject,
  SingleMonsterResponseData,
} from "@shared/types/index.js";
import {
  contributorDisplayNamesFromEntry,
  errorHandler,
  getCredentials,
  getKeyAsset,
  getRibbonFromStoredWinners,
  getVisitor,
  World,
} from "@utils/index.js";

/**
 * GET /api/monsters/:id
 *
 * Payload for the Single Monster View drawer. Sources monster data from the
 * roster; when the monster has been evicted, falls back to the caller's
 * `visitorData.contributedMonsters` history. If both miss but the dropped
 * monster asset is still in the world (orphan from a pre-this-PR eviction
 * where `World.deleteDroppedAssets` silently failed), serves from the
 * asset's own dataObject so a click never shows "Monster not found" when
 * the art is still right there. Admins see `canDelete: true`.
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
      // Last-resort: this monster was evicted from the roster (or
      // `deleteBrokenMonster` scrubbed it) but its dropped-monster asset
      // is still in the world — pull the monster details from
      // the asset's own dataObject.
      try {
        const world = World.create(urlSlug, { credentials });
        const matches = await world.fetchDroppedAssetsWithUniqueName({
          uniqueName: `MonsterMash-monster-${monsterId}`,
        });
        const monsterAsset = matches?.[0];
        if (monsterAsset) {
          await monsterAsset.fetchDataObject();
          const assetData = (monsterAsset.dataObject || {}) as Partial<MonsterAssetDataObject>;
          if (assetData.name && assetData.imageUrl) {
            const contributorProfileIds: string[] = assetData.contributorProfileIds ?? [];
            const contributorDisplayNames: string[] = assetData.contributorDisplayNames ?? [];
            const callerContributed = contributorProfileIds.includes(profileId);
            const monster: GalleryMonster = {
              monsterId,
              monsterAssetId: monsterAsset.id as string,
              name: assetData.name,
              birthdate: assetData.birthdate ?? 0,
              imageUrl: assetData.imageUrl,
              contributorProfileIds,
              contributorDisplayNames,
              latestAward: undefined,
              callerContributed,
              fromCallerHistory: false,
            };
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
            const payload: SingleMonsterResponseData = { monster, canDelete: !!isAdmin };
            return res.json({ success: true, data: payload });
          }
        }
      } catch (error) {
        console.warn(`handleGetMonster: orphan-asset fallback failed for ${monsterId}`, error);
      }
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
