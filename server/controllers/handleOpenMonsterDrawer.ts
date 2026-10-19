import { Request, Response } from "express";
import { VisitorInterface } from "@rtsdk/topia";
import { KeyAssetDataObject } from "@shared/types/index.js";
import { Visitor, errorHandler, getCredentials, getKeyAsset, getVisitor, transitionToDrawer } from "@utils/index.js";

/**
 * POST /api/monsters/:id/open
 *
 * Modal → drawer transition for the Single Monster View. Client fires this
 * when the caller clicks a Gallery card so the detail surface renders in
 * the same fixed-width drawer used when a monster is clicked in the world.
 *
 * No state mutation — just verifies the monster exists (on the roster OR
 * in the caller's contributedMonsters history) so we don't hand the caller
 * a drawer pointing at a nonexistent record.
 */
export const handleOpenMonsterDrawer = async (req: Request, res: Response) => {
  try {
    const source = req.body && req.body.interactiveNonce ? req.body : req.query;
    const credentials = getCredentials(source);
    const monsterId = req.params.id;
    if (!monsterId) return res.status(400).json({ success: false, message: "monsterId required" });

    const keyAsset = await getKeyAsset(credentials);
    const dataObject = keyAsset.dataObject as KeyAssetDataObject;

    // Monster is on the roster
    const onRoster = !!dataObject.monsters?.[monsterId];
    let visitor: VisitorInterface;
    if (onRoster) {
      visitor = await Visitor.create(credentials.visitorId, credentials.urlSlug, { credentials });
    } else {
      // Monster has been evicted. We need visitorData to confirm
      // the caller has it in their own contributedMonsters history before
      // handing them a drawer for a record that isn't on the roster.
      const { visitor: v, visitorData } = await getVisitor(credentials);
      const inHistory = !!visitorData.contributedMonsters?.[monsterId];
      if (!inHistory) {
        return res.status(404).json({ success: false, message: "Monster not found." });
      }
      visitor = v;
    }

    await transitionToDrawer({
      visitor,
      credentials,
      host: req.hostname,
      screen: "single-monster",
      params: { monsterId },
    });

    return res.json({ success: true, data: { monsterId } });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleOpenMonsterDrawer",
      message: "Error opening monster drawer",
      req,
      res,
    });
  }
};
