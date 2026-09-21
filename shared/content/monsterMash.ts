/**
 * Monster Mash static content — parts, categories, name tokens, voting categories,
 * layer order. Shared between the client (Builder UI, previews) and the server
 * (validation, composition).
 *
 * When Bekama delivers final art, drop PNGs into `client/public/parts/{section}/{category}/{partId}.png`
 * (or point PARTS_BASE_URL at the production bucket). Every part must be the
 * SAME dimensions with a transparent background — the compositor stacks them
 * in `LAYER_ORDER` and does no per-part offset/scale.
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
  { id: "shirt", section: "torso", label: "Body / shirt", layerKey: "torso.shirt", allowsNone: false },
  { id: "arms", section: "torso", label: "Arms", layerKey: "torso.arms", allowsNone: false },
  { id: "sleeves", section: "torso", label: "Sleeves", layerKey: "torso.sleeves", allowsNone: true },
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
// Parts (individual pickable pieces)
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
 * Placeholder catalog. Real parts will be dropped in by the artist; each entry
 * needs a matching PNG at `{PARTS_BASE_URL}/{section}/{categoryId}/{imageName}`.
 *
 * Kept intentionally small until final art lands — enough to exercise every
 * code path (a category with allowsNone, a legs.legs with supportsFeet=false, etc.).
 */
export const PARTS: readonly PartDef[] = [
  
  // head.headShape — required, no NONE
  { id: "round", section: "head", categoryId: "headShape", imageName: "round.png" },
  { id: "square", section: "head", categoryId: "headShape", imageName: "square.png" },
  { id: "jack-o-lantern", section: "head", categoryId: "headShape", imageName: "jack-o-lantern.png" },

  // head.eyes
  { id: "googly", section: "head", categoryId: "eyes", imageName: "googly.png" },
  { id: "cyclops", section: "head", categoryId: "eyes", imageName: "cyclops.png" },

  // head.nose (allowsNone)
  { id: "button", section: "head", categoryId: "nose", imageName: "button.png" },
  { id: "snout", section: "head", categoryId: "nose", imageName: "snout.png" },

  // head.mouth (allowsNone)
  { id: "smile", section: "head", categoryId: "mouth", imageName: "smile.png" },
  { id: "fangs", section: "head", categoryId: "mouth", imageName: "fangs.png" },

  // head.hair (allowsNone)
  { id: "top-hat", section: "head", categoryId: "hair", imageName: "top-hat.png" },
  { id: "crown", section: "head", categoryId: "hair", imageName: "crown.png" },

  // torso.shirt — required
  { id: "stripes", section: "torso", categoryId: "shirt", imageName: "stripes.png" },
  { id: "cape", section: "torso", categoryId: "shirt", imageName: "cape.png" },

  // torso.arms — required
  { id: "human", section: "torso", categoryId: "arms", imageName: "human.png" },
  { id: "tentacles", section: "torso", categoryId: "arms", imageName: "tentacles.png" },

  // torso.sleeves (allowsNone)
  { id: "puffy", section: "torso", categoryId: "sleeves", imageName: "puffy.png" },

  // torso.collar (allowsNone)
  { id: "bow-tie", section: "torso", categoryId: "collar", imageName: "bow-tie.png" },
  { id: "necklace", section: "torso", categoryId: "collar", imageName: "necklace.png" },

  // torso.back (allowsNone)
  { id: "bat-wings", section: "torso", categoryId: "torsoBack", imageName: "bat-wings.png" },
  { id: "jetpack", section: "torso", categoryId: "torsoBack", imageName: "jetpack.png" },

  // legs.legs — required
  { id: "human-legs", section: "legs", categoryId: "legs", imageName: "human-legs.png", supportsFeet: true },
  { id: "goat-legs", section: "legs", categoryId: "legs", imageName: "goat-legs.png", supportsFeet: true },
  { id: "wheelchair", section: "legs", categoryId: "legs", imageName: "wheelchair.png", supportsFeet: false },
  { id: "tentacle-legs", section: "legs", categoryId: "legs", imageName: "tentacle-legs.png", supportsFeet: false },

  // legs.feet (allowsNone)
  { id: "boots", section: "legs", categoryId: "feet", imageName: "boots.png" },
  { id: "sneakers", section: "legs", categoryId: "feet", imageName: "sneakers.png" },

  // legs.waist (allowsNone) — the waistband layer (skirt / shorts base).
  { id: "sash", section: "legs", categoryId: "waist", imageName: "sash.png" },

  // legs.belt (allowsNone) — belt accessory rendered on top of the waistband.
  { id: "chain-belt", section: "legs", categoryId: "belt", imageName: "chain-belt.png" },
  { id: "utility-belt", section: "legs", categoryId: "belt", imageName: "utility-belt.png" },

  // legs.back (allowsNone)
  { id: "tail", section: "legs", categoryId: "legsBack", imageName: "tail.png" },
] as const;

export const PARTS_BY_CATEGORY: Record<string, readonly PartDef[]> = CATEGORIES.reduce(
  (acc, cat) => {
    acc[cat.id] = PARTS.filter((p) => p.categoryId === cat.id);
    return acc;
  },
  {} as Record<string, PartDef[]>,
);

export const PART_BY_ID: Record<string, PartDef> = PARTS.reduce(
  (acc, p) => {
    acc[p.id] = p;
    return acc;
  },
  {} as Record<string, PartDef>,
);

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
  "torso.sleeves",
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
