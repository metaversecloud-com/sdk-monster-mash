/**
 * Monster Mash static content — categories, name tokens, voting categories,
 * layer order. Shared between the client (Builder UI, previews) and the server
 * (validation, composition).
 *
 * The list of PARTS is NOT here — the server walks `client/public/parts/` at
 * boot (see `server/utils/content/getContent.ts`) and pushes the catalog to
 * the client via the `/api/main-app` response. `LAYER_ORDER`, `CATEGORIES`,
 * and per-part `supportsFeet` overrides live here as policy — they don't
 * change when the artist drops in new part files.
 *
 * On-disk layout the loader expects:
 *   `client/public/parts/{section}/{categoryId}/{partId}.png`
 * where `{partId}` is the filename stem (also used as the display key).
 */

import { Section } from "../types/SharedTypes.js";

// ─────────────────────────────────────────────────────────────────────
// Categories (drawer accordions)
// ─────────────────────────────────────────────────────────────────────

/**
 * `layerKey` is the slot this category writes into for `LAYER_ORDER`.
 * `allowsNone` — if true, the picker includes a NONE tile (no-part is a valid look).
 * `required` — every category is required (spec §Builder: "there are no optional categories");
 *   `allowsNone` is how "nothing" is expressed.
 */
export interface CategoryDef {
  id: string;
  section: Section;
  label: string;
  layerKey: string;
  allowsNone: boolean;
}

export const CATEGORIES: readonly CategoryDef[] = [
  // Head
  { id: "headShape", section: "head", label: "Head shape", layerKey: "head.headShape", allowsNone: false },
  { id: "nose", section: "head", label: "Nose", layerKey: "head.nose", allowsNone: true },
  { id: "eyes", section: "head", label: "Eyes", layerKey: "head.eyes", allowsNone: false },
  { id: "mouth", section: "head", label: "Mouth", layerKey: "head.mouth", allowsNone: true },
  { id: "hair", section: "head", label: "Hair / hat", layerKey: "head.hair", allowsNone: true },

  // Torso
  { id: "shirt", section: "torso", label: "Shirt", layerKey: "torso.shirt", allowsNone: false },
  { id: "arms", section: "torso", label: "Arms", layerKey: "torso.arms", allowsNone: false },
  { id: "collar", section: "torso", label: "Collar", layerKey: "torso.collar", allowsNone: true },
  { id: "torsoBack", section: "torso", label: "Back item", layerKey: "torso.back", allowsNone: true },

  // Legs
  { id: "legs", section: "legs", label: "Legs", layerKey: "legs.legs", allowsNone: false },
  { id: "feet", section: "legs", label: "Feet", layerKey: "legs.feet", allowsNone: true },
  { id: "waist", section: "legs", label: "Waist", layerKey: "legs.waist", allowsNone: true },
  { id: "belt", section: "legs", label: "Belt", layerKey: "legs.belt", allowsNone: true },
  { id: "legsBack", section: "legs", label: "Back item (legs)", layerKey: "legs.back", allowsNone: true },
] as const;

export const CATEGORIES_BY_SECTION: Record<Section, readonly CategoryDef[]> = {
  head: CATEGORIES.filter((c) => c.section === "head"),
  torso: CATEGORIES.filter((c) => c.section === "torso"),
  legs: CATEGORIES.filter((c) => c.section === "legs"),
};

// ─────────────────────────────────────────────────────────────────────
// Part shape (identity — the catalog itself comes from the server)
// ─────────────────────────────────────────────────────────────────────

/**
 * `supportsFeet` is legs-only. When a picked `legs.legs` part has
 * `supportsFeet: false`, the Builder disables the `feet` category and
 * fires the incompatibility modal (spec §Legs sub-rule).
 */
export interface PartDef {
  id: string;
  section: Section;
  categoryId: string;
  imageName: string; // e.g. "eyes-googly.png"
  supportsFeet?: boolean;
}

/**
 * Small policy override: which `legs.legs` part IDs cannot host feet. Keyed
 * by partId (which is also the filename stem — see the S3 layout comment at
 * the top of this file). The list is short and stable enough to hand-maintain
 * even though the parts list itself is dynamic.
 */
export const NO_FEET_LEG_PARTS: readonly string[] = ["mermaid-tail", "tentacles", "spring"] as const;

/** Attach `supportsFeet` metadata to a raw part discovered on S3 / disk. */
export const applyPartOverrides = (raw: Omit<PartDef, "supportsFeet">): PartDef => {
  if (raw.categoryId === "legs" && NO_FEET_LEG_PARTS.includes(raw.id)) {
    return { ...raw, supportsFeet: false };
  }
  if (raw.categoryId === "legs") return { ...raw, supportsFeet: true };
  return raw;
};

/** Group + index helpers (pure functions) — used to be static exports. */
export const buildPartsByCategory = (parts: readonly PartDef[]): Record<string, readonly PartDef[]> => {
  const out: Record<string, PartDef[]> = {};
  for (const cat of CATEGORIES) out[cat.id] = [];
  for (const p of parts) {
    if (!out[p.categoryId]) out[p.categoryId] = [];
    out[p.categoryId].push(p);
  }
  return out;
};

export const buildPartById = (parts: readonly PartDef[]): Record<string, PartDef> => {
  const out: Record<string, PartDef> = {};
  for (const p of parts) out[p.id] = p;
  return out;
};

// ─────────────────────────────────────────────────────────────────────
// Layer order (locked, back → front)
// ─────────────────────────────────────────────────────────────────────

/**
 * The Jimp compositor iterates this array. Client preview stacks <img>
 * elements in the same order via z-index — the spec's requirement that
 * the drawer preview matches the final composed image.
 */
export const LAYER_ORDER: readonly string[] = [
  "legs.back",
  "torso.back",
  "legs.legs",
  "torso.shirt",
  "torso.arms",
  "torso.collar",
  "legs.feet",
  "legs.waist",
  "legs.belt",
  "head.headShape",
  "head.eyes",
  "head.mouth",
  "head.nose",
  "head.hair",
] as const;

// ─────────────────────────────────────────────────────────────────────
// Name tokens (dropdown of 30, one pick per section)
// ─────────────────────────────────────────────────────────────────────

/**
 * Head → first name, Torso → last name, Legs → title. Composed name is
 * `[firstName, lastName, title].join(" ")` at completion.
 */
export const NAME_TOKENS: Record<Section, readonly string[]> = {
  head: [
    "Harold",
    "Beatrix",
    "Kitty",
    "Penelope",
    "Grackabella",
    "Bartholomew",
    "Ophelia",
    "Reginald",
    "Millicent",
    "Cornelius",
    "Winifred",
    "Percival",
    "Esmerelda",
    "Ignatius",
    "Prudence",
    "Barnaby",
    "Dorcas",
    "Fenwick",
    "Gwendolyn",
    "Hubert",
    "Isadora",
    "Jasper",
    "Kirby",
    "Lavinia",
    "Montague",
    "Nadine",
    "Octavia",
    "Phineas",
    "Quentin",
    "Rowena",
  ],
  torso: [
    "McFishy",
    "Von Gribble",
    "Thorpington",
    "Snarfblat",
    "Wobblesworth",
    "Gloopers",
    "Bumblesnout",
    "Cracklewick",
    "Doodlebottom",
    "Fizzlepop",
    "Grimshaw",
    "Hemlock",
    "Ironmonger",
    "Jinglewhump",
    "Kettlebrook",
    "Lightfoot",
    "Mudsplatter",
    "Nettleworth",
    "Oldbones",
    "Pickleherring",
    "Quackleberry",
    "Rumblestone",
    "Snickerdoodle",
    "Tumbleweed",
    "Underhill",
    "Vexingham",
    "Warblegate",
    "Yellowbelly",
    "Zippercrank",
    "Cadwallader",
  ],
  legs: [
    "the Magnificent",
    "the Ancient",
    "the Third",
    "the Sneaky",
    "the Scaly",
    "the Brave",
    "the Bold",
    "the Curious",
    "the Dashing",
    "the Erratic",
    "the Fearsome",
    "the Grumpy",
    "the Hasty",
    "the Impish",
    "the Jolly",
    "the Kindly",
    "the Legendary",
    "the Mysterious",
    "the Noble",
    "the Oblivious",
    "the Peculiar",
    "the Quirky",
    "the Ravenous",
    "the Speedy",
    "the Terrific",
    "the Unstoppable",
    "the Valiant",
    "the Whimsical",
    "the Xenial",
    "the Zealous",
  ],
};

// ─────────────────────────────────────────────────────────────────────
// Voting categories (one per week, rotates)
// ─────────────────────────────────────────────────────────────────────

/**
 * Rotation runs in `orderIds` order (spec §Voting Categories launch order).
 * `question` is the H1 on the Vote tab: "Which one is the {question}?".
 */
export interface VotingCategoryDef {
  id: string;
  label: string; // ribbon + short chip label (e.g. "SILLIEST")
  question: string; // fills "Which one is the ___?"
}

export const VOTING_CATEGORIES: readonly VotingCategoryDef[] = [
  { id: "silliest", label: "Silliest", question: "Silliest" },
  { id: "best-dressed", label: "Best Dressed", question: "Best Dressed" },
  { id: "cutest", label: "Cutest", question: "Cutest" },
  { id: "grumpiest", label: "Grumpiest", question: "Grumpiest" },
  { id: "spookiest", label: "Spookiest", question: "Spookiest" },
  { id: "friendliest", label: "Friendliest", question: "Friendliest" },
  { id: "sneakiest", label: "Sneakiest", question: "Sneakiest" },
  { id: "wisest", label: "Wisest", question: "Wisest" },
  { id: "bravest", label: "Bravest", question: "Bravest" },
  { id: "weirdest", label: "Weirdest", question: "Weirdest" },
] as const;

export const VOTING_CATEGORY_BY_ID: Record<string, VotingCategoryDef> = VOTING_CATEGORIES.reduce(
  (acc, c) => {
    acc[c.id] = c;
    return acc;
  },
  {} as Record<string, VotingCategoryDef>,
);

// ─────────────────────────────────────────────────────────────────────
// Caps + timing constants
// ─────────────────────────────────────────────────────────────────────

export const IN_PROGRESS_CAP = 100;
export const FINISHED_CAP = 200;
export const LEADERBOARD_CAP = 25;
export const STORED_WINNERS_MAX = 30; // 10 weeks × 3 places
export const MIN_POOL_SIZE_FOR_VOTE = 10;
export const SECTION_LOCK_TTL_MS = 30 * 60 * 1000; // 30 min

/** Every window / cycle is anchored in this timezone. Not overridable. */
export const APP_TIMEZONE = "America/New_York" as const;
