import {
  CATEGORIES,
  CATEGORIES_BY_SECTION,
  LAYER_ORDER,
  PartDef,
  buildPartById,
  buildPartsByCategory,
} from "@shared/content/monsterMash.js";
import { loadPartsFromDisk } from "./loadPartsFromDisk.js";

/**
 * The parts catalog is fixed game content — it's bundled with the app in
 * `client/public/parts/` (also copied to `client/build/parts/` at build
 * time). The server walks that folder once at first access and memoizes
 * the result. `refreshContent()` clears the cache so a running dev server
 * can pick up newly added art without restart.
 */
interface CachedContent {
  parts: readonly PartDef[];
  partsByCategory: Record<string, readonly PartDef[]>;
  partById: Record<string, PartDef>;
  loadedAt: number;
}

let cache: CachedContent | null = null;

const buildCache = (): CachedContent => {
  const parts = loadPartsFromDisk();
  return {
    parts,
    partsByCategory: buildPartsByCategory(parts),
    partById: buildPartById(parts),
    loadedAt: Date.now(),
  };
};

export const getContent = (): CachedContent => {
  if (!cache) cache = buildCache();
  return cache;
};

export const refreshContent = (): CachedContent => {
  cache = null;
  return getContent();
};

/** Same shape emitted by both the API payload and the client context. */
export interface ClientContentPayload {
  categories: typeof CATEGORIES;
  categoriesBySection: typeof CATEGORIES_BY_SECTION;
  layerOrder: typeof LAYER_ORDER;
  parts: readonly PartDef[];
  loadedAt: number;
}

export const buildClientPayload = (): ClientContentPayload => {
  const { parts, loadedAt } = getContent();
  return {
    categories: CATEGORIES,
    categoriesBySection: CATEGORIES_BY_SECTION,
    layerOrder: LAYER_ORDER,
    parts,
    loadedAt,
  };
};
