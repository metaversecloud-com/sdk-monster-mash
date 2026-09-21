import { AwardRibbon, Section } from "./SharedTypes.js";

/**
 * Monster Mash per-profile state. Keyed by `${urlSlug}-${sceneDropId}` inside
 * the visitor/user dataObject (Visitor and User classes access the SAME record
 * — pick the class by which id you have).
 */
export interface MonsterMashVisitorData {
  schemaVersion: 1;
  dateStarted: number;

  /**
   * Every monster this profile has contributed a section to (this instance).
   * Enriched on finalize with monster metadata so the "Show only my monsters"
   * gallery filter still surfaces monsters that have rotated out of the
   * 200-cap roster (spec §Gallery: "Your own monsters are never dropped from
   * the gallery").
   */
  contributedMonsters: {
    [monsterId: string]: {
      section: Section;
      submittedAt: number;
      completedAt?: number;
      awards?: AwardRibbon[];
      /** Set on finalize — persists across roster eviction. */
      monsterAssetId?: string;
      name?: string;
      imageUrl?: string;
      birthdate?: number;
      contributorProfileIds?: string[];
      contributorDisplayNames?: string[];
    };
  };

  /** Section the caller currently has locked (max one at a time). */
  activeDraft?: {
    monsterId: string;
    section: Section;
    lockedAt: number;
    lastActivityAt: number;
    picks: { [categoryId: string]: string };
    nameToken?: string;
  };

  /** Green-banner queue: monsters this profile contributed to that just won awards. */
  pendingWinBanners: Array<AwardRibbon & { monsterId: string }>;

  /** Blue-banner queue: monsters this profile helped build that just completed. */
  pendingCompletionBanners: Array<{
    monsterId: string;
    monsterName: string;
    completedAt: number;
  }>;

  // Badge/analytics counters — all per instance.
  daysAppOpened: string[];
  weeksVotedIn: string[];
  weeksSubmittedIn: string[];
  weeksCreatedMonsterIn: string[];
  votesCastThisWeek: { windowId: string; count: number };
  totalVotesCast: number;
  totalThirdSectionCompletions: number;
}

/**
 * A visitor's full dataObject can hold state for many apps and many worlds.
 * Each app scopes itself under `${urlSlug}-${sceneDropId}`; anything at the
 * root is either cross-world or belongs to a different app entirely.
 */
export interface VisitorDataObjectType {
  [scopedKey: string]: MonsterMashVisitorData | unknown;
}
