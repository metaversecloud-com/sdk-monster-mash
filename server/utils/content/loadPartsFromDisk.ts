import fs from "fs";
import path from "path";
import { CATEGORIES, PartDef, applyPartOverrides } from "@shared/content/monsterMash.js";
import { resolvePartsRoot } from "./partsRoot.js";

/**
 * Walk the on-disk parts tree at `{partsRoot}/{section}/{categoryId}/*.png`
 * and derive the Part catalog. Files whose section/category are not in the
 * `CATEGORIES` list are skipped so an artist can leave WIP folders in place
 * without breaking the loader.
 *
 * This runs once at server startup (memoized by `getContent()`). The art
 * ships in the client's `public/parts/` folder, so it's bundled with the
 * app and requires no S3 credentials or listing permissions — see the
 * partsRoot resolver for the dev/prod path pair.
 */
const KNOWN_KEYS = new Set(CATEGORIES.map((c) => `${c.section}/${c.id}`));
const IMAGE_EXTS = new Set([".png", ".webp", ".jpg", ".jpeg"]);

export const loadPartsFromDisk = (): PartDef[] => {
  const root = resolvePartsRoot();
  const collected: PartDef[] = [];
  let seen = 0;
  let skipped = 0;

  for (const section of fs.readdirSync(root, { withFileTypes: true })) {
    if (!section.isDirectory()) continue;
    const sectionDir = path.join(root, section.name);
    for (const category of fs.readdirSync(sectionDir, { withFileTypes: true })) {
      if (!category.isDirectory()) continue;
      if (!KNOWN_KEYS.has(`${section.name}/${category.name}`)) {
        skipped++;
        continue;
      }
      const categoryDir = path.join(sectionDir, category.name);
      for (const file of fs.readdirSync(categoryDir, { withFileTypes: true })) {
        if (!file.isFile()) continue;
        const ext = path.extname(file.name).toLowerCase();
        if (!IMAGE_EXTS.has(ext)) {
          skipped++;
          continue;
        }
        seen++;
        collected.push(
          applyPartOverrides({
            id: file.name.slice(0, -ext.length),
            section: section.name as PartDef["section"],
            categoryId: category.name,
            imageName: file.name,
          }),
        );
      }
    }
  }

  // Collision check — part ids are the filename stem, and `partById` (in
  // shared/content/monsterMash.ts) keys by that stem alone. If two files
  // across different sections/categories share the same stem, the second
  // overwrites the first in `partById` and picks resolve to the wrong art
  // (this exact bug bit us with `tentacles.png` in legs/legs and torso/arms
  // and again with `kimono.png` in torso/shirt and legs/waist). Rename one
  // of the conflicting files with a section/category suffix, e.g.
  // `kimono-shirt.png` / `kimono-waist.png`.
  const seenIds = new Map<string, string>();
  for (const p of collected) {
    const location = `${p.section}/${p.categoryId}/${p.imageName}`;
    const prior = seenIds.get(p.id);
    if (prior && prior !== location) {
      console.error(
        `loadPartsFromDisk: DUPLICATE part id "${p.id}" — ${prior} and ${location}. ` +
          `Rename one of the files (e.g. append -${p.categoryId}) so ids are globally unique.`,
      );
    } else {
      seenIds.set(p.id, location);
    }
  }

  console.log(
    `loadPartsFromDisk: ${collected.length} parts loaded from ${root} (${seen} images seen · ${skipped} skipped)`,
  );
  return collected;
};

/**
 * Resolve a part's on-disk path so the compositor can read its bytes with
 * Jimp. Returns `null` when the file isn't present so callers can skip
 * gracefully rather than crashing the composite.
 */
export const partFilePath = (part: Pick<PartDef, "section" | "categoryId" | "imageName">): string | null => {
  const root = resolvePartsRoot();
  const p = path.join(root, part.section, part.categoryId, part.imageName);
  return fs.existsSync(p) ? p : null;
};
