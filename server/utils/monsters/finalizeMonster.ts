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
import { createEmptyVisitorData } from "../getVisitor.js";
import { User, World } from "../topiaInit.js";
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
    // Source of truth: `contributedDrafts[monsterId][section]` on the peer's
    // visitor data. A truly missing entry logs and continues with empty
    // picks + empty name token so the composed monster still ships.
    const scopedKey = `${credentials.urlSlug}-${credentials.sceneDropId}`;
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
        target = await User.create({
          profileId: slot.contributorProfileId,
          credentials: { ...credentials, profileId: slot.contributorProfileId },
        });
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
      let source: "contributedDrafts" | "none";
      if (draft) {
        picks = draft.picks ?? {};
        nameToken = draft.nameToken ?? "";
        source = "contributedDrafts";
      } else {
        picks = {};
        nameToken = "";
        source = "none";
      }

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

    // Validate completeness BEFORE compose. If any peer section ended up
    // with no picks or no nameToken (visitor fetch failed, visitor data
    // missing, race on their contributedDrafts write), DON'T finalize a
    // half-rendered monster into the gallery. The caller's controller
    // catches this throw and leaves the monster in-progress for a retry
    // sweep in `handleGetMainApp` to pick up.
    for (const p of peers) {
      if (!p.picks || Object.keys(p.picks).length === 0 || !p.nameToken) {
        throw new Error(
          `finalizeMonster: incomplete data for ${monsterId}/${p.section} (contributor=${p.contributorProfileId}, source=${p.picks && Object.keys(p.picks).length ? "nameToken" : "picks"}) — won't finalize a broken monster`,
        );
      }
    }

    const composedName = composeMonsterName(nameTokensBySection);
    if (!composedName) {
      throw new Error(`finalizeMonster: composed name empty for ${monsterId} — won't finalize a broken monster`);
    }
    const birthdate = Date.now();

    // 3. Compose + upload (S3). Any failure throws so the controller's
    // catch leaves the monster in-progress (NOT marked complete) and the
    // retry sweep in `handleGetMainApp` picks it up.
    const imageUrl: string = await composeAndUploadMonster(monsterId, picksBySection, credentials.interactivePublicKey);

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
    // Add the monster to this week's eligible pool. Eligibility follows the
    // `state === "complete"` roster entry, NOT the dropped-asset drop — a
    // world-drop failure (S3 hiccup, missing image URL) shouldn't strand a
    // finished monster out of the vote pool while the Gallery is happily
    // rendering it. If the asset drop later succeeds, the monster is already
    // eligible; if it never succeeds, the vote still works because matchups
    // key on `monsterId`, not `monsterAssetId`.
    const eligibleIds = new Set(window.eligibleMonsterIds ?? []);
    eligibleIds.add(monsterId);

    // Build the lean COMPLETE-shape entry from scratch — do NOT spread the
    // old in-progress entry. Once finalized, the roster only needs identity
    // fields; the state machine (`sections`), lock-expiry pointers
    // (`createdAt`, `lastEditedAt`), and legacy `inProgressSections` are
    // deliberately dropped so the key asset stays small at scale (Firestore
    // per-doc size caps). Per-section picks + nameTokens live on the
    // dropped-monster asset's dataObject (`MonsterAssetDataObject.sections`).
    // Display names collapse to a pipe-joined string in [head, torso, legs]
    // order — matches `contributorProfileIds` ordering.
    //
    // Award ribbons are NOT on the roster entry — they live on
    // `storedWinners[monsterId]`. Nothing to preserve across this rewrite.
    const nextRoster = { ...(dataObject.monsters ?? {}) };
    nextRoster[monsterId] = {
      monsterId,
      state: "complete",
      birthdate,
      name: composedName,
      contributorProfileIds,
      contributorNames: contributorDisplayNames.join("|"),
      ...(monsterAssetId ? { monsterAssetId } : {}),
      ...(imageUrl ? { imageUrl } : {}),
    };
    const eviction = evictFinishedIfCapped(nextRoster);
    const rosterAfterCap = eviction.changed ? eviction.monsters : nextRoster;

    // Remove the evicted monsters' world drops in one batch call. Non-fatal:
    // if the asset is already gone (admin manually deleted, concurrent
    // cleanup, Topia-side 404), we just continue — the roster has already
    // dropped them so there's nothing left for the server to recover.
    if (eviction.evictedIds.length > 0) {
      const evictedAssetIds = eviction.evictedIds
        .map((id) => dataObject.monsters?.[id]?.monsterAssetId)
        .filter((aid): aid is string => !!aid);
      if (evictedAssetIds.length > 0) {
        try {
          await World.deleteDroppedAssets(
            credentials.urlSlug,
            evictedAssetIds,
            process.env.INTERACTIVE_SECRET || "",
            credentials,
          );
        } catch (error) {
          console.warn(
            `finalizeMonster: non-fatal failure deleting ${evictedAssetIds.length} evicted world asset(s)`,
            error,
          );
        }
      }
    }

    // Prune evicted ids from the vote-state structures so the next cycle
    // doesn't inherit stale pool entries. Without this, `pickMatchup` can
    // keep picking monsters that are no longer on the roster — the Vote
    // tab silently renders empty when the live-filtered pool shrinks
    // below the min size.
    const evictSet = new Set(eviction.evictedIds);
    const prunedEligible = Array.from(eligibleIds).filter((id) => !evictSet.has(id));

    const nextCycle = dataObject.currentVoteCycle
      ? {
          ...dataObject.currentVoteCycle,
          poolMonsterIds: (dataObject.currentVoteCycle.poolMonsterIds ?? []).filter((id) => !evictSet.has(id)),
          tallies: Object.fromEntries(
            Object.entries(dataObject.currentVoteCycle.tallies ?? {}).filter(([id]) => !evictSet.has(id)),
          ),
        }
      : dataObject.currentVoteCycle;

    const keyAssetPatch: Record<string, unknown> = {
      monsters: rosterAfterCap,
      currentSubmissionWindow: { ...window, eligibleMonsterIds: prunedEligible },
    };
    if (eviction.evictedIds.length > 0 && dataObject.currentVoteCycle) {
      keyAssetPatch.currentVoteCycle = nextCycle;
    }

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
  const scoped = (rawUserData[scopedKey] as MonsterMashVisitorData | undefined) ?? createEmptyVisitorData();
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
