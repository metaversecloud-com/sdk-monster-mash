import { Section, SECTIONS } from "@shared/types/index.js";
import { composeMonsterBuffer } from "./composeImage.js";
import { uploadPngToS3 } from "./uploadToS3.js";

/**
 * Compose the full monster from its three sets of picks and upload to
 * `userUploads/{interactivePublicKey}/{monsterId}.png`. Returns the S3 URL.
 *
 * Called by `finalizeMonster` when the third section lands. Picks come from
 * each contributor's visitor `contributedDrafts[monsterId]` rather than a
 * per-section roster field — the key asset no longer stores parts data.
 */
export const composeAndUploadMonster = async (
  monsterId: string,
  picksBySection: Partial<Record<Section, { [categoryId: string]: string }>>,
  interactivePublicKey: string,
): Promise<string> => {
  const allPicks = SECTIONS.map((section) => ({
    section,
    picks: picksBySection[section] ?? {},
  }));
  const buffer = await composeMonsterBuffer(allPicks);
  const key = `userUploads/${interactivePublicKey}/${monsterId}.png`;
  return uploadPngToS3(buffer, key);
};
