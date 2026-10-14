import { Section, SECTIONS } from "@shared/types/index.js";
import { composeMonsterBuffer } from "./composeImage.js";
import { getEcosystemFolder } from "./getEcosystemFolder.js";
import { uploadPngToS3 } from "./uploadToS3.js";

/**
 * Compose the full monster from its three sets of picks and upload to
 * `userUploads/{ecosystem}/{monsterId}.png`. Returns the S3 URL.
 *
 * `requestHost` is the inbound request's hostname (Express `req.hostname`);
 * the ecosystem folder is derived from it via `getEcosystemFolder` so each
 * deployment lands in its own bucket subfolder. Unknown hosts fall back
 * to `other/` instead of silently writing to the bucket root.
 *
 * Called by `finalizeMonster` when the third section lands. Picks come from
 * each contributor's visitor `contributedDrafts[monsterId]` rather than a
 * per-section roster field — the key asset no longer stores parts data.
 */
export const composeAndUploadMonster = async (
  monsterId: string,
  picksBySection: Partial<Record<Section, { [categoryId: string]: string }>>,
  requestHost: string | undefined,
): Promise<string> => {
  const allPicks = SECTIONS.map((section) => ({
    section,
    picks: picksBySection[section] ?? {},
  }));
  const buffer = await composeMonsterBuffer(allPicks);
  const ecosystem = getEcosystemFolder(requestHost);
  const key = `userUploads/${ecosystem}/${monsterId}.png`;
  return uploadPngToS3(buffer, key);
};
