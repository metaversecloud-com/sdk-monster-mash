import { Request, Response } from "express";
import { VOTING_CATEGORY_BY_ID } from "@shared/content/monsterMash.js";
import { MonsterMashVisitorData, Place } from "@shared/types/index.js";
import { errorHandler, getCredentials, getVisitor } from "@utils/index.js";

const PLACE_LABEL: Record<Place, string> = { 1: "1st", 2: "2nd", 3: "3rd" };

/**
 * POST /api/banners/acknowledge
 * Body: { win?: boolean, completion?: boolean }
 *
 * Clears the caller's pending banner queues once the client has surfaced
 * them. Also fires the platform `visitor.fireToast` calls that go with the
 * banners — one toast per queued entry per spec:
 *
 *   - Win: title "Your Monster won {Category}!" + text
 *     "Your monster {name} placed {place} in {category}"
 *   - Completion: title "A monster you helped build is finished!" + text
 *     with the monster name.
 *
 * The win text pulls the monster name from the caller's own
 * `contributedMonsters[monsterId].name` (stamped at finalize). Falls back
 * to a generic "Your monster" when the record isn't there.
 *
 * Toasts and queue clear happen in the SAME request, atomically from the
 * client's perspective: a user who sees a banner once sees exactly one
 * matching toast, no matter how many rapid refreshes happen beforehand
 * (the next ack sees an empty queue and fires nothing).
 */
export const handleAcknowledgeBanners = async (req: Request, res: Response) => {
  try {
    const source = req.body && req.body.interactiveNonce ? req.body : req.query;
    const credentials = getCredentials(source);
    const { visitor, visitorData } = await getVisitor(credentials);

    const clearWin = req.body?.win !== false;
    const clearCompletion = req.body?.completion !== false;

    // Fire toasts for each queued entry we're about to clear. Parallel +
    // fire-and-forget — a failed `fireToast` must not block the queue clear
    // (the user already saw the banner; a missed toast is nothing we can
    // recover from on retry anyway, and holding up the ack would leave them
    // with the banner on-screen forever).
    const fireCalls: Promise<unknown>[] = [];
    if (clearWin) {
      for (const w of visitorData.pendingWinBanners ?? []) {
        const categoryLabel = VOTING_CATEGORY_BY_ID[w.category]?.label ?? w.category;
        const monsterName = visitorData.contributedMonsters?.[w.monsterId]?.name;
        const nameClause = monsterName ? `Your monster ${monsterName}` : "Your monster";
        fireCalls.push(
          visitor
            .fireToast({
              groupId: `mm-win-${w.monsterId}`,
              title: `Your monster won!`,
              text: `${nameClause} placed ${PLACE_LABEL[w.place]} in ${categoryLabel}`,
            })
            .catch(() => {}),
        );
      }
    }
    if (clearCompletion) {
      for (const c of visitorData.pendingCompletionBanners ?? []) {
        fireCalls.push(
          visitor
            .fireToast({
              groupId: `mm-complete-${c.monsterId}`,
              title: "A monster you helped build is finished!",
              text: c.monsterName,
            })
            .catch(() => {}),
        );
      }
    }

    const next: MonsterMashVisitorData = { ...visitorData };
    if (clearWin) next.pendingWinBanners = [];
    if (clearCompletion) next.pendingCompletionBanners = [];

    const scopedKey = `${credentials.urlSlug}-${credentials.sceneDropId}`;
    await Promise.all([visitor.updateDataObject({ [scopedKey]: next }, {}), ...fireCalls]);

    return res.json({ success: true, data: { cleared: { win: clearWin, completion: clearCompletion } } });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleAcknowledgeBanners",
      message: "Error acknowledging banners",
      req,
      res,
    });
  }
};
