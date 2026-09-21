import { Request, Response } from "express";
import {
  GalleryMonster,
  GalleryResponseData,
  KeyAssetDataObject,
  MonsterIndexEntry,
  MonsterMashVisitorData,
} from "@shared/types/index.js";
import { errorHandler, getCredentials, getKeyAsset, getVisitor } from "@utils/index.js";

/**
 * GET /api/gallery
 *
 * Query params:
 *   ?mine=true     — restrict to caller's contributions (includes monsters
 *                    that have rotated out of the 200-cap roster, sourced
 *                    from `visitorData.contributedMonsters`).
 *   ?winners=true  — restrict to monsters with a `latestAward`.
 *   ?sort=oldest   — default `newest`.
 */
export const handleGetGallery = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    const mine = req.query.mine === "true";
    const winners = req.query.winners === "true";
    const sort: "newest" | "oldest" = req.query.sort === "oldest" ? "oldest" : "newest";

    const keyAsset = await getKeyAsset(credentials);
    const dataObject = keyAsset.dataObject as KeyAssetDataObject;
    const { visitorData } = await getVisitor(credentials);

    const rosterFinished = Object.values(dataObject.monsters ?? {}).filter(
      (m): m is MonsterIndexEntry => !!m && m.state === "complete",
    );
    const rosterById = new Map<string, MonsterIndexEntry>(
      rosterFinished.map((m) => [m.monsterId, m]),
    );

    const callerContrib = visitorData.contributedMonsters ?? {};
    const callerHistoryIds = Object.keys(callerContrib);
    const callerContribSet = new Set(callerHistoryIds);

    // Union candidate ids.
    const candidateIds = new Set<string>([...rosterById.keys()]);
    if (mine) {
      // "mine" starts from the caller's history — includes evicted monsters.
      candidateIds.clear();
      for (const id of callerHistoryIds) candidateIds.add(id);
    }

    const monsters: GalleryMonster[] = [];
    for (const id of candidateIds) {
      const rosterEntry = rosterById.get(id);
      const contribEntry = callerContrib[id];

      // Prefer roster metadata; fall back to visitor.contributedMonsters for evicted monsters.
      const source =
        rosterEntry
          ? {
              name: rosterEntry.name ?? "",
              birthdate: rosterEntry.birthdate ?? 0,
              imageUrl: rosterEntry.imageUrl ?? null,
              monsterAssetId: rosterEntry.monsterAssetId,
              contributorProfileIds: rosterEntry.contributorProfileIds ?? [],
              contributorDisplayNames: computeDisplayNames(rosterEntry, contribEntry),
              latestAward: rosterEntry.latestAward,
            }
          : {
              name: contribEntry?.name ?? "",
              birthdate: contribEntry?.birthdate ?? 0,
              imageUrl: contribEntry?.imageUrl ?? null,
              monsterAssetId: contribEntry?.monsterAssetId,
              contributorProfileIds: contribEntry?.contributorProfileIds ?? [],
              contributorDisplayNames: contribEntry?.contributorDisplayNames ?? [],
              latestAward: (contribEntry?.awards ?? [])[0],
            };

      if (winners && !source.latestAward) continue;

      monsters.push({
        monsterId: id,
        monsterAssetId: source.monsterAssetId,
        name: source.name,
        birthdate: source.birthdate,
        imageUrl: source.imageUrl,
        contributorProfileIds: source.contributorProfileIds,
        contributorDisplayNames: source.contributorDisplayNames,
        latestAward: source.latestAward,
        callerContributed: callerContribSet.has(id),
        fromCallerHistory: !rosterEntry,
      });
    }

    monsters.sort((a, b) => (sort === "newest" ? b.birthdate - a.birthdate : a.birthdate - b.birthdate));

    const payload: GalleryResponseData = {
      monsters,
      filter: { mine, winners },
      sort,
      totalOnRoster: rosterFinished.length,
      totalInCallerHistory: callerHistoryIds.length,
    };

    return res.json({ success: true, data: payload });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleGetGallery",
      message: "Error getting gallery",
      req,
      res,
    });
  }
};

/**
 * The roster carries contributor display names on each section slot; the
 * caller's contributedMonsters store carries the 3-tuple. Use whichever
 * has data.
 */
const computeDisplayNames = (
  entry: MonsterIndexEntry,
  contribEntry: MonsterMashVisitorData["contributedMonsters"][string] | undefined,
): string[] => {
  if (contribEntry?.contributorDisplayNames?.length) return contribEntry.contributorDisplayNames;
  const names: string[] = [];
  for (const s of ["head", "torso", "legs"] as const) {
    const n = entry.sections?.[s]?.contributorDisplayName;
    if (n) names.push(n);
  }
  return names;
};
