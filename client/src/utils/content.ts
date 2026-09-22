import { useContext, useMemo } from "react";
import { GlobalStateContext } from "@/context/GlobalContext";
import { CATEGORIES, CATEGORIES_BY_SECTION, LAYER_ORDER, PartDef, buildPartById, buildPartsByCategory } from "@shared/content/monsterMash";

/**
 * Runtime content — categories + layer order are static (from the shared
 * module), the parts catalog comes from context (server-provided via
 * /api/main-app). Everything that used to import `PARTS_BY_CATEGORY` /
 * `PART_BY_ID` / `PARTS` statically now calls `useContent()`.
 */
export const useContent = () => {
  const { content } = useContext(GlobalStateContext);
  const parts = content?.parts ?? EMPTY_PARTS;
  const partsByCategory = useMemo(() => buildPartsByCategory(parts), [parts]);
  const partById = useMemo(() => buildPartById(parts), [parts]);
  return {
    categories: CATEGORIES,
    categoriesBySection: CATEGORIES_BY_SECTION,
    layerOrder: LAYER_ORDER,
    parts,
    partsByCategory,
    partById,
  };
};

const EMPTY_PARTS: readonly PartDef[] = [];
