import {
  CATEGORIES_BY_SECTION,
  NAME_TOKENS,
  PART_BY_ID,
  PARTS_BY_CATEGORY,
} from "@shared/content/monsterMash.js";
import { Section } from "@shared/types/index.js";

const NONE_ID = "NONE";

export interface ValidatePicksInput {
  section: Section;
  picks: { [categoryId: string]: string };
  nameToken: string;
}

export interface ValidatePicksResult {
  ok: boolean;
  error?: string;
  /** Picks normalized to the shape we store — NONE picks are recorded as `"NONE"`. */
  normalizedPicks?: { [categoryId: string]: string };
}

/**
 * Server-side re-validation of what the Builder claims the user picked. The
 * client validates the same way, but never trust it — every submitted section
 * flows through here.
 *
 * Rules:
 *  - Every category for `section` must have a pick (`allowsNone` categories
 *    accept `"NONE"`; others require a real part id).
 *  - Every part id must resolve to a part under the caller's `section`.
 *  - `nameToken` must be one of the section's authored 30.
 *  - Legs-only: if `legs.legs` is a `supportsFeet: false` part, `legs.feet`
 *    must be `"NONE"` (mockup image5's "no feet" pill).
 *  - No `parts.categoryId` outside the section's category list (rejects
 *    smuggling head picks under a torso submit).
 */
export const validatePicks = ({ section, picks, nameToken }: ValidatePicksInput): ValidatePicksResult => {
  if (!picks || typeof picks !== "object") return { ok: false, error: "picks payload required" };

  const cats = CATEGORIES_BY_SECTION[section];
  const catIds = new Set(cats.map((c) => c.id));

  // Reject picks from other sections.
  for (const key of Object.keys(picks)) {
    if (!catIds.has(key)) return { ok: false, error: `unexpected category "${key}" for section "${section}"` };
  }

  const normalized: { [key: string]: string } = {};
  for (const cat of cats) {
    const pick = picks[cat.id];
    if (!pick) return { ok: false, error: `missing pick for category "${cat.id}"` };
    if (pick === NONE_ID) {
      if (!cat.allowsNone) return { ok: false, error: `category "${cat.id}" cannot be NONE` };
      normalized[cat.id] = NONE_ID;
      continue;
    }
    const part = PART_BY_ID[pick];
    if (!part) return { ok: false, error: `unknown part "${pick}"` };
    if (part.section !== section) return { ok: false, error: `part "${pick}" belongs to section "${part.section}"` };
    if (part.categoryId !== cat.id) return { ok: false, error: `part "${pick}" belongs to category "${part.categoryId}"` };
    // Sanity: PARTS_BY_CATEGORY should always contain this part; check to catch drift.
    const partsInCat = PARTS_BY_CATEGORY[cat.id] ?? [];
    if (!partsInCat.some((p) => p.id === pick)) return { ok: false, error: `part "${pick}" not registered under "${cat.id}"` };
    normalized[cat.id] = pick;
  }

  // Legs-specific: if `legs` doesn't support feet, `feet` must be NONE.
  if (section === "legs") {
    const legsPick = normalized["legs"];
    const legsPart = legsPick !== NONE_ID ? PART_BY_ID[legsPick] : null;
    if (legsPart && legsPart.supportsFeet === false && normalized["feet"] !== NONE_ID) {
      return { ok: false, error: `legs "${legsPick}" cannot have feet — pick NONE for feet` };
    }
  }

  // Name token: must be an authored one for this section.
  if (typeof nameToken !== "string" || !nameToken.trim()) return { ok: false, error: "nameToken required" };
  if (!NAME_TOKENS[section].includes(nameToken)) return { ok: false, error: `nameToken "${nameToken}" not authored for ${section}` };

  return { ok: true, normalizedPicks: normalized };
};
