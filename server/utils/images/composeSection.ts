import { Section } from "@shared/types/index.js";
import { composeSectionBuffer } from "./composeImage.js";
import { uploadPngToS3 } from "./uploadToS3.js";

/**
 * Compose one section's picks into a PNG and upload it to
 * `monster-mash/sections/{monsterId}-{section}.png`. Returns the S3 URL.
 * Called on every section submit so the Create-tab reveal (for peer
 * contributors who've already submitted their own section) has real art.
 */
export const composeAndUploadSection = async (
  monsterId: string,
  section: Section,
  picks: { [categoryId: string]: string },
): Promise<string> => {
  const buffer = await composeSectionBuffer(section, picks);
  const key = `monster-mash/sections/${monsterId}-${section}.png`;
  return uploadPngToS3(buffer, key);
};
