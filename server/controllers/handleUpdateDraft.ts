import { Request, Response } from "express";
import { MonsterMashVisitorData, Section, SECTIONS } from "@shared/types/index.js";
import { errorHandler, getCredentials, getVisitor } from "@utils/index.js";

/**
 * POST /api/monsters/:id/draft
 * Body: { section, picks, nameToken? }
 *
 * Debounced auto-save from the Builder as the caller changes picks. Only
 * touches the CALLER's visitor dataObject — no key-asset writes, no lock,
 * no image compose. Verifies the caller currently holds an activeDraft on
 * this (monster, section) so a stale drawer can't clobber someone else.
 *
 * Best-effort: on any mismatch we return 409 without an error toast (the
 * client swallows failures for auto-save). No 4xx-throw path — validation
 * of parts happens on real submit.
 */
export const handleUpdateDraft = async (req: Request, res: Response) => {
  try {
    const source = req.body && req.body.interactiveNonce ? req.body : req.query;
    const credentials = getCredentials(source);
    const { urlSlug, sceneDropId } = credentials;

    const monsterId = req.params.id;
    if (!monsterId) return res.status(400).json({ success: false, message: "monsterId required" });

    const section = req.body?.section as Section;
    if (!SECTIONS.includes(section)) return res.status(400).json({ success: false, message: "valid section required" });

    const picks = (req.body?.picks ?? {}) as Record<string, string>;
    const nameToken: string | undefined = req.body?.nameToken;

    const { visitor, visitorData } = await getVisitor(credentials);
    const activeDraft = visitorData.activeDraft;
    if (!activeDraft || activeDraft.monsterId !== monsterId || activeDraft.section !== section) {
      return res.status(409).json({ success: false, message: "No active draft for this section." });
    }

    const now = Date.now();
    const nextVisitorData: MonsterMashVisitorData = {
      ...visitorData,
      activeDraft: {
        ...activeDraft,
        picks,
        nameToken: nameToken ?? activeDraft.nameToken,
        lastActivityAt: now,
      },
    };
    const visitorKey = `${urlSlug}-${sceneDropId}`;
    await visitor.updateDataObject({ [visitorKey]: nextVisitorData }, {});

    return res.json({ success: true });
  } catch (error) {
    return errorHandler({
      error,
      functionName: "handleUpdateDraft",
      message: "Error saving draft",
      req,
      res,
    });
  }
};
