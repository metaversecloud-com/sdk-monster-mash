import { Request, Response } from "express";
import {
  GalleryMonster,
  GalleryResponseData,
  KeyAssetDataObject,
  MonsterIndexEntry,
  MonsterMashVisitorData,
} from "@shared/types/index.js";
import {
  contributorDisplayNamesFromEntry,
  errorHandler,
  getCredentials,
  getKeyAsset,
  getVisitor,
} from "@utils/index.js";

/**
 * GET /api/gallery
 *
 * Returns the UNION of:
 *   - every `state === "complete"` monster on the key-asset roster
 *   - every entry in the caller's visitor `contributedMonsters` history
 *     (so monsters that have rotated out of the 200-cap roster still
 *     surface for the caller - "Your own monsters are never
 *     dropped from the gallery")
 *
 * Each card carries `callerContributed` + `latestAward` so the client can
 * apply the Gallery's three UI controls (sort, "my monsters only", "winners
 * only") as pure derived state. Payload is bounded (FINISHED_CAP = 200 +
 * caller's history), so a single-shot fetch beats a round-trip per toggle.
 */
export const handleGetGallery = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    const keyAsset = await getKeyAsset(credentials);
    const dataObject = keyAsset.dataObject as KeyAssetDataObject;
    const { visitorData } = await getVisitor(credentials);

    const rosterFinished = Object.values(dataObject.monsters ?? {}).filter(
      (m): m is MonsterIndexEntry => !!m && m.state === "complete",
    );
    const rosterById = new Map<string, MonsterIndexEntry>(rosterFinished.map((m) => [m.monsterId, m]));

    const callerContrib = visitorData.contributedMonsters ?? {};
    const callerHistoryIds = Object.keys(callerContrib);
    const callerContribSet = new Set(callerHistoryIds);

    // Union candidate ids: everything on the roster, plus anything in the
    // caller's history that's since been evicted.
    const candidateIds = new Set<string>([...rosterById.keys(), ...callerHistoryIds]);

    const monsters: GalleryMonster[] = [];
    for (const id of candidateIds) {
      const rosterEntry = rosterById.get(id);
      const contribEntry = callerContrib[id];

      // Prefer roster metadata; fall back to visitor.contributedMonsters for evicted monsters.
      const source = rosterEntry
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

    // Default server-side sort: newest first by birthdate. The client can
    // re-sort locally when the user flips the dropdown.
    monsters.sort((a, b) => b.birthdate - a.birthdate);

    const payload: GalleryResponseData = {
      monsters,
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
 * Prefer the caller's visitor-side 3-tuple (it survives roster eviction).
 * Otherwise pull from the roster entry — `contributorNames` on complete
 * monsters, `sections[s].contributorDisplayName` on in-progress ones.
 */
const computeDisplayNames = (
  entry: MonsterIndexEntry,
  contribEntry: MonsterMashVisitorData["contributedMonsters"][string] | undefined,
): string[] => {
  if (contribEntry?.contributorDisplayNames?.length) return contribEntry.contributorDisplayNames;
  return contributorDisplayNamesFromEntry(entry);
};
