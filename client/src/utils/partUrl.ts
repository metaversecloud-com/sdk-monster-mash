import { PartDef } from "@shared/content/monsterMash";

/**
 * Resolve a part id to its PNG URL. Requires the caller to pass the current
 * `partById` map (the parts catalog ships from the server via context — see
 * `useContent`). Returns `null` for `NONE` / unknown ids so the caller can
 * skip rendering.
 *
 * Parts are bundled with the app under `client/public/parts/` and served
 * same-origin at `/parts/{section}/{categoryId}/{imageName}` — Vite handles
 * dev, and `express.static(client/build)` handles prod.
 */
export const makePartUrl = (partById: Record<string, PartDef>) => (partId: string | undefined): string | null => {
  if (!partId || partId === "NONE") return null;
  const part = partById[partId];
  if (!part) return null;
  return `/parts/${part.section}/${part.categoryId}/${part.imageName}`;
};
