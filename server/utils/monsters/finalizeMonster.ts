import { DroppedAssetInterface, UserInterface, VisitorInterface } from "@rtsdk/topia";
import {
  KeyAssetDataObject,
  MonsterAssetDataObject,
  MonsterIndexEntry,
  MonsterMashVisitorData,
  Section,
  SECTIONS,
  SectionRecord,
  VisitorDataObjectType,
} from "@shared/types/index.js";
import { Credentials } from "../../types/index.js";
import { composeAndUploadMonster } from "../images/composeMonster.js";
import { User } from "../topiaInit.js";
import { composeMonsterName } from "./composeMonsterName.js";
import { dropMonsterAsset } from "./dropMonsterAsset.js";
import { evictFinishedIfCapped } from "./evictFinishedIfCapped.js";
import { standardizeError } from "../standardizeError.js";

interface FinalizeMonsterInput {
  credentials: Credentials;
  keyAsset: DroppedAssetInterface;
  visitor: VisitorInterface | null;
  monsterId: string;
  entry: MonsterIndexEntry; // roster entry with all three sections marked done
  /** The just-submitted section (caller's own). */
  callerSection: Section;
  /** Caller's picks for their section (freshly validated in the controller). */
  callerPicks: { [categoryId: string]: string };
  /** Caller's name token for their section. */
  callerNameToken: string;
  clickableLinkBase: string;
}

export interface FinalizeMonsterResult {
  imageUrl: string | null;
  monsterAssetId: string | null;
  monsterAssetData: MonsterAssetDataObject | null;
  composedName: string;
  /** Roster + submission-window patch — caller MUST merge this into its keyAsset write. */
  keyAssetPatch: Record<string, unknown>;
  /**
   * `contributedMonsters[monsterId]` enrichment for the CALLER's visitor.
   * Caller MUST merge this into its own single visitor write (per the
   * "one write per controller per dataObject" rule) — finalize skips the
   * caller entirely and only writes peer visitors.
   */
  callerContribution: Partial<MonsterMashVisitorData["contributedMonsters"][string]>;
}

interface PeerDraft {
  section: Section;
  picks: { [categoryId: string]: string };
  nameToken: string;
  contributorProfileId: string;
  contributorDisplayName: string;
  submittedAt: number;
  rawUserData: VisitorDataObjectType; // captured for the final write to avoid double-fetch
  target: UserInterface | null; // null when the peer's User couldn't be resolved
}

/**
 * Post-submit orchestrator for a monster whose third section just landed.
 *
 * The heavy lifting compared to the previous version:
 *   - We NO LONGER have per-section pick data on the key asset. Peer picks
 *     live on each peer's visitor `contributedDrafts[monsterId]`. This
 *     function fetches them, composes the monster, then in the same peer
 *     writes it does for contributedMonsters + banner queues, it also
 *     deletes `contributedDrafts[monsterId]` — keeping visitor blobs lean
 *     (memory: "one write per controller per dataObject").
 *   - Compose + upload is wrapped in a try/catch so a local-dev environment
 *     without S3 credentials doesn't block the completion of the monster;
 *     the caller's controller still marks state=complete + records the win.
 */
export const finalizeMonster = async ({
  credentials,
  keyAsset,
  visitor,
  monsterId,
  entry,
  callerSection,
  callerPicks,
  callerNameToken,
  clickableLinkBase,
}: FinalizeMonsterInput): Promise<FinalizeMonsterResult> => {
  try {
    // 1. Collect peer picks from each peer's visitor dataObject.
    //
    // Preferred source is `contributedDrafts[monsterId][section]` on the
    // peer's visitor data (current schema). If that isn't there — e.g. the
    // peer submitted their section BEFORE the contributedDrafts schema
    // landed — fall back to legacy `entry.inProgressSections[section]` on
    // the key-asset roster, which older code wrote at submit time. We
    // access that field via a type escape because the current
    // `MonsterIndexEntry` no longer declares it, but old runtime data may
    // still carry it. A truly missing entry logs and continues with empty
    // picks + empty name token so the composed monster still ships.
    const scopedKey = `${credentials.urlSlug}-${credentials.sceneDropId}`;
    const legacyEntry = entry as unknown as {
      inProgressSections?: Partial<
        Record<Section, { parts?: { [k: string]: string }; nameToken?: string }>
      >;
    };
    const peers: PeerDraft[] = [];
    for (const s of SECTIONS) {
      if (s === callerSection) continue;
      const slot = entry.sections?.[s];
      if (!slot || !slot.contributorProfileId) {
        console.warn(`finalizeMonster: missing contributor slot for ${monsterId}/${s} — continuing without it`);
        continue;
      }
      let rawUserData: VisitorDataObjectType = {};
      let target: UserInterface | null = null;
      try {
        target = await User.create({ credentials: { ...credentials, profileId: slot.contributorProfileId } });
        rawUserData = ((await target.fetchDataObject()) || {}) as VisitorDataObjectType;
      } catch (error) {
        console.warn(
          `finalizeMonster: could not load peer ${slot.contributorProfileId} for ${monsterId}/${s} — using empty picks`,
          error,
        );
      }
      const scoped = (rawUserData[scopedKey] as MonsterMashVisitorData | undefined) ?? undefined;
      const draft = scoped?.contributedDrafts?.[monsterId]?.[s];

      let picks: { [categoryId: string]: string };
      let nameToken: string;
      let source: "contributedDrafts" | "legacy-roster" | "none";
      if (draft) {
        picks = draft.picks ?? {};
        nameToken = draft.nameToken ?? "";
        source = "contributedDrafts";
      } else {
        const legacy = legacyEntry.inProgressSections?.[s];
        if (legacy && (legacy.parts || legacy.nameToken)) {
          picks = legacy.parts ?? {};
          nameToken = legacy.nameToken ?? "";
          source = "legacy-roster";
        } else {
          picks = {};
          nameToken = "";
          source = "none";
        }
      }

      console.log(
        `finalizeMonster: peer ${slot.contributorProfileId} for ${monsterId}/${s} → source=${source} · pickKeys=${Object.keys(picks).length} · nameToken="${nameToken}"`,
      );

      peers.push({
        section: s,
        picks,
        nameToken,
        contributorProfileId: slot.contributorProfileId,
        contributorDisplayName: slot.contributorDisplayName ?? "",
        submittedAt: slot.submittedAt ?? Date.now(),
        rawUserData,
        target,
      });
    }

    // 2. Build the full picks-by-section + name tokens maps (caller + peers).
    const picksBySection: Partial<Record<Section, { [categoryId: string]: string }>> = {
      [callerSection]: callerPicks,
    };
    const nameTokensBySection: Partial<Record<Section, string>> = {
      [callerSection]: callerNameToken,
    };
    for (const p of peers) {
      picksBySection[p.section] = p.picks;
      nameTokensBySection[p.section] = p.nameToken;
    }
    const composedName = composeMonsterName(nameTokensBySection);
    const birthdate = Date.now();

    // 3. Compose + upload (S3). Best-effort so a missing-cred dev environment
    // doesn't strand the monster in a half-done state — imageUrl stays null
    // and the caller's controller still marks state=complete.
    let imageUrl: string | null = null;
    try {
      imageUrl = await composeAndUploadMonster(monsterId, picksBySection);
    } catch (error) {
      console.error(`finalizeMonster: compose/upload failed for ${monsterId} — completion continues without imageUrl`, error);
    }

    // 4. Build the SectionRecord map + contributor arrays (used both for the
    // dropped-asset dataObject and for downstream reads).
    const callerSlot = entry.sections?.[callerSection];
    const sectionRecords: Record<Section, SectionRecord> = {
      head: null as any,
      torso: null as any,
      legs: null as any,
    };
    sectionRecords[callerSection] = {
      contributorProfileId: credentials.profileId,
      contributorDisplayName: callerSlot?.contributorDisplayName ?? "",
      submittedAt: callerSlot?.submittedAt ?? birthdate,
      parts: callerPicks,
      nameToken: callerNameToken,
    };
    for (const p of peers) {
      sectionRecords[p.section] = {
        contributorProfileId: p.contributorProfileId,
        contributorDisplayName: p.contributorDisplayName,
        submittedAt: p.submittedAt,
        parts: p.picks,
        nameToken: p.nameToken,
      };
    }
    const contributorProfileIds: [string, string, string] = [
      sectionRecords.head.contributorProfileId,
      sectionRecords.torso.contributorProfileId,
      sectionRecords.legs.contributorProfileId,
    ];
    const contributorDisplayNames: [string, string, string] = [
      sectionRecords.head.contributorDisplayName,
      sectionRecords.torso.contributorDisplayName,
      sectionRecords.legs.contributorDisplayName,
    ];

    // 5. Drop the world asset — only if we successfully uploaded (needs a URL).
    let monsterAssetId: string | null = null;
    let monsterAssetData: MonsterAssetDataObject | null = null;
    if (imageUrl) {
      monsterAssetData = {
        schemaVersion: 1,
        monsterId,
        name: composedName,
        birthdate,
        imageUrl,
        contributorProfileIds,
        contributorDisplayNames,
        sections: sectionRecords,
      };
      try {
        const droppedAsset = await dropMonsterAsset({
          credentials,
          visitor,
          monsterId,
          imageUrl,
          clickableLinkBase,
          monsterAssetData,
        });
        monsterAssetId = droppedAsset.id as string;
      } catch (error) {
        console.error(`finalizeMonster: dropMonsterAsset failed for ${monsterId}`, error);
      }
    }

    // 6. Build the keyAsset patch (do NOT write here — return it to the controller).
    const dataObject = keyAsset.dataObject as KeyAssetDataObject;
    const window = dataObject.currentSubmissionWindow ?? {
      windowId: "",
      startAt: 0,
      endAt: 0,
      eligibleMonsterIds: [] as string[],
    };
    const eligibleIds = new Set(window.eligibleMonsterIds ?? []);
    if (monsterAssetId) eligibleIds.add(monsterId);

    const nextRoster = { ...(dataObject.monsters ?? {}) };
    nextRoster[monsterId] = {
      ...nextRoster[monsterId],
      state: "complete",
      birthdate,
      name: composedName,
      sections: entry.sections,
      contributorProfileIds,
      lastEditedAt: birthdate,
      ...(monsterAssetId ? { monsterAssetId } : {}),
      ...(imageUrl ? { imageUrl } : {}),
    };
    const eviction = evictFinishedIfCapped(nextRoster);
    const rosterAfterCap = eviction.changed ? eviction.monsters : nextRoster;

    const keyAssetPatch: Record<string, unknown> = {
      monsters: rosterAfterCap,
      currentSubmissionWindow: { ...window, eligibleMonsterIds: Array.from(eligibleIds) },
    };

    // 7. Fan out per-peer visitor writes. One write per peer combining:
    //     · contributedMonsters[monsterId] enrichment
    //     · pendingCompletionBanners append
    //     · contributedDrafts[monsterId] delete
    const contributionEnrichment: Partial<MonsterMashVisitorData["contributedMonsters"][string]> = {
      monsterAssetId: monsterAssetId ?? undefined,
      name: composedName,
      imageUrl: imageUrl ?? undefined,
      birthdate,
      contributorProfileIds,
      contributorDisplayNames,
    };
    const completionBanner = {
      monsterId,
      monsterName: composedName,
      completedAt: birthdate,
    };

    for (const p of peers) {
      if (!p.target) continue; // couldn't resolve this peer's User earlier
      try {
        await patchPeerAtomically({
          target: p.target,
          rawUserData: p.rawUserData,
          scopedKey,
          monsterId,
          enrichment: contributionEnrichment,
          appendCompletionBanner: completionBanner,
        });
      } catch (error) {
        console.warn(`finalizeMonster: peer contributor patch failed for ${p.contributorProfileId}`, error);
      }
    }

    // The caller's visitor write happens in handleSubmitSection so its own
    // updateDataObject includes activeDraft clear + contributedMonsters
    // enrichment + contributedDrafts[monsterId] delete, all in one write.
    const callerContribution: Partial<MonsterMashVisitorData["contributedMonsters"][string]> = {
      ...contributionEnrichment,
      completedAt: birthdate,
    };

    void visitor; // caller's visitor is handled by the controller (see comment above)
    return {
      imageUrl,
      monsterAssetId,
      monsterAssetData,
      composedName,
      keyAssetPatch,
      callerContribution,
    };
  } catch (error) {
    throw standardizeError(error);
  }
};

/**
 * ONE `updateDataObject` per peer. Merges the contributedMonsters enrichment,
 * the completion banner, AND the contributedDrafts[monsterId] cleanup into a
 * single write. `rawUserData` was fetched up front (in step 1 of finalize)
 * so we don't refetch here.
 */
const patchPeerAtomically = async ({
  target,
  rawUserData,
  scopedKey,
  monsterId,
  enrichment,
  appendCompletionBanner,
}: {
  target: UserInterface;
  rawUserData: VisitorDataObjectType;
  scopedKey: string;
  monsterId: string;
  enrichment: Partial<MonsterMashVisitorData["contributedMonsters"][string]>;
  appendCompletionBanner: { monsterId: string; monsterName: string; completedAt: number };
}) => {
  const scoped = (rawUserData[scopedKey] as MonsterMashVisitorData | undefined) ?? emptyScoped();
  const existingContribution = scoped.contributedMonsters?.[monsterId] ?? {
    section: "head" as Section,
    submittedAt: Date.now(),
  };
  const nextContribution = { ...existingContribution, ...enrichment, completedAt: enrichment.birthdate };

  const nextDrafts = { ...(scoped.contributedDrafts ?? {}) };
  delete nextDrafts[monsterId];

  const nextScoped: MonsterMashVisitorData = {
    ...scoped,
    contributedMonsters: {
      ...(scoped.contributedMonsters ?? {}),
      [monsterId]: nextContribution,
    },
    pendingCompletionBanners: [...(scoped.pendingCompletionBanners ?? []), appendCompletionBanner],
    contributedDrafts: nextDrafts,
  };
  await target.updateDataObject({ [scopedKey]: nextScoped }, {});
};

const emptyScoped = (): MonsterMashVisitorData => ({
  schemaVersion: 1,
  dateStarted: Date.now(),
  contributedMonsters: {},
  pendingWinBanners: [],
  pendingCompletionBanners: [],
  daysAppOpened: [],
  weeksVotedIn: [],
  weeksSubmittedIn: [],
  weeksCreatedMonsterIn: [],
  votesCastThisWeek: { windowId: "", count: 0 },
  totalVotesCast: 0,
  totalThirdSectionCompletions: 0,
});
