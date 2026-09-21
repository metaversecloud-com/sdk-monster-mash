import { PART_BY_ID } from "@shared/content/monsterMash";

/**
 * Resolve a part id to its PNG URL. Local dev serves the placeholder art
 * from `/parts/{section}/{categoryId}/{imageName}` via Vite's public/;
 * production sets `VITE_PARTS_BASE_URL` at build time to point at S3.
 *
 * Returns `null` for `"NONE"` / unknown ids so the caller can skip rendering.
 */
export const partUrl = (partId: string | undefined): string | null => {
  if (!partId || partId === "NONE") return null;
  const part = PART_BY_ID[partId];
  if (!part) return null;
  const base = (import.meta.env.VITE_PARTS_BASE_URL as string | undefined) ?? "/parts";
  return `${base.replace(/\/$/, "")}/${part.section}/${part.categoryId}/${part.imageName}`;
};
