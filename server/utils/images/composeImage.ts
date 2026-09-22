import Jimp from "jimp";
import { CATEGORIES, LAYER_ORDER, PartDef } from "@shared/content/monsterMash.js";
import { Section } from "@shared/types/index.js";
import { getContent } from "../content/getContent.js";
import { partFilePath } from "../content/loadPartsFromDisk.js";

const NONE_ID = "NONE";

const resolvePartPath = (partById: Record<string, PartDef>, partId: string): string | null => {
  if (!partId || partId === NONE_ID) return null;
  const part = partById[partId];
  if (!part) return null;
  return partFilePath(part);
};

interface SectionSourcePicks {
  section: Section;
  picks: { [categoryId: string]: string };
}

/**
 * Compose a stack of parts into a single PNG buffer.
 *
 * `layerKeysInScope` is the subset of LAYER_ORDER we want to include (e.g.
 * for a per-section image we scope to that section's categories; for a full
 * monster we pass everything). Layers whose pick is NONE / missing are
 * skipped — the compositor doesn't care whether it's a partial monster.
 *
 * Parts are read directly from disk (`client/public/parts/` in dev,
 * `client/build/parts/` in prod) via `partFilePath`. No HTTP fetch and no
 * S3 credentials are involved.
 */
const composeLayers = async (
  layerKeysInScope: readonly string[],
  layerToPart: Map<string, string>,
): Promise<Buffer> => {
  const { partById } = getContent();
  const layerImages: Jimp[] = [];
  for (const layerKey of LAYER_ORDER) {
    if (!layerKeysInScope.includes(layerKey)) continue;
    const partId = layerToPart.get(layerKey);
    if (!partId) continue;
    const filePath = resolvePartPath(partById, partId);
    if (!filePath) continue;
    try {
      const image = await Jimp.read(filePath);
      layerImages.push(image);
    } catch (error) {
      // Missing / unreadable art shouldn't crash the entire compose —
      // skip and continue so an incomplete art delivery still ships a
      // usable image.
      console.warn(`composeImage: could not read ${filePath}`, error);
    }
  }

  if (layerImages.length === 0) {
    // Emit a small transparent PNG so callers still get a valid buffer.
    const blank = new Jimp(1, 1, 0x00000000);
    return blank.getBufferAsync(Jimp.MIME_PNG);
  }

  let maxWidth = 0;
  let maxHeight = 0;
  for (const img of layerImages) {
    if (img.bitmap.width > maxWidth) maxWidth = img.bitmap.width;
    if (img.bitmap.height > maxHeight) maxHeight = img.bitmap.height;
  }

  const canvas = new Jimp(maxWidth, maxHeight, 0x00000000);
  for (const img of layerImages) {
    canvas.composite(img, 0, 0, {
      mode: Jimp.BLEND_SOURCE_OVER,
      opacitySource: 1,
      opacityDest: 1,
    });
  }
  return canvas.getBufferAsync(Jimp.MIME_PNG);
};

/**
 * Build the categoryId → layerKey map for the given sections' catalog, then
 * flip it to `layerKey → partId` using the caller's picks. Layers this
 * caller isn't providing simply don't show up.
 */
const buildLayerMap = (allPicks: readonly SectionSourcePicks[]): Map<string, string> => {
  const layerToPart = new Map<string, string>();
  for (const src of allPicks) {
    for (const [categoryId, partId] of Object.entries(src.picks)) {
      const cat = CATEGORIES.find((c) => c.id === categoryId);
      if (!cat) continue;
      layerToPart.set(cat.layerKey, partId);
    }
  }
  return layerToPart;
};

/** Compose one section's picks into a PNG buffer. */
export const composeSectionBuffer = async (section: Section, picks: { [categoryId: string]: string }): Promise<Buffer> => {
  const sectionLayerKeys = CATEGORIES.filter((c) => c.section === section).map((c) => c.layerKey);
  return composeLayers(sectionLayerKeys, buildLayerMap([{ section, picks }]));
};

/** Compose a full monster from all three sections' picks into a PNG buffer. */
export const composeMonsterBuffer = async (allPicks: readonly SectionSourcePicks[]): Promise<Buffer> => {
  return composeLayers(LAYER_ORDER, buildLayerMap(allPicks));
};
