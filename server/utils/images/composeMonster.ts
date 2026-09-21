import { InProgressSectionRecord, Section, SECTIONS } from "@shared/types/index.js";
import { composeMonsterBuffer } from "./composeImage.js";
import { uploadPngToS3 } from "./uploadToS3.js";

/**
 * Compose the full monster from its three completed section records and
 * upload to `monster-mash/monsters/{monsterId}.png`. Returns the S3 URL.
 * Called by `finalizeMonster` when the third section lands.
 */
export const composeAndUploadMonster = async (
  monsterId: string,
  inProgressSections: Partial<Record<Section, InProgressSectionRecord>>,
): Promise<string> => {
  const allPicks = SECTIONS.map((section) => {
    const record = inProgressSections[section];
    return { section, picks: record?.parts ?? {} };
  });
  const buffer = await composeMonsterBuffer(allPicks);
  const key = `monster-mash/monsters/${monsterId}.png`;
  return uploadPngToS3(buffer, key);
};
