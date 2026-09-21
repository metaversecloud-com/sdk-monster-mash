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
import { enqueueCompletionBannersForProfiles } from "../banners/index.js";
import { composeAndUploadMonster } from "../images/composeMonster.js";
import { User } from "../topiaInit.js";
import { dropMonsterAsset } from "./dropMonsterAsset.js";
import { evictFinishedIfCapped } from "./evictFinishedIfCapped.js";
import { standardizeError } from "../standardizeError.js";

interface FinalizeMonsterInput {
  credentials: Credentials;
  keyAsset: DroppedAssetInterface;
  visitor: VisitorInterface | null;
  monsterId: string;
  entry: MonsterIndexEntry; // the just-completed roster entry (state must be "complete")
  clickableLinkBase: string;
}

export interface FinalizeMonsterResult {
  imageUrl: string;
  monsterAssetId: string;
  monsterAssetData: MonsterAssetDataObject;
}

/**
 * Post-submit orchestrator for a monster whose third section just landed.
 * Runs in this order:
 *
 *   1. Compose the full monster PNG → S3.
 *   2. Drop a new asset in the world with the composed PNG + clickable link.
 *   3. Migrate: `inProgressSections` off the key-asset roster (they live on
 *      the per-monster dropped asset now), append to submission-window
 *      `eligibleMonsterIds`, write imageUrl + monsterAssetId onto the roster
 *      entry, and cap the finished roster at FINISHED_CAP (200).
 *   4. Fan out enriched contribution metadata to each contributor's visitor
 *      data (Visitor class for the current caller, User class for the two
 *      peers). This lets the caller's own-monsters filter surface finished
 *      monsters even after the roster evicts them.
 */
export const finalizeMonster = async ({
  credentials,
  keyAsset,
  visitor,
  monsterId,
  entry,
  clickableLinkBase,
}: FinalizeMonsterInput): Promise<FinalizeMonsterResult> => {
  try {
    // 1. Compose + upload the full monster PNG.
    const imageUrl = await composeAndUploadMonster(monsterId, entry.inProgressSections ?? {});

    // 2. Assemble per-monster dataObject.
    const [head, torso, legs] = SECTIONS.map((s) => entry.inProgressSections?.[s]);
    if (!head || !torso || !legs) throw new Error(`finalizeMonster: missing section record on ${monsterId}`);

    const sectionRecords: Record<Section, SectionRecord> = {
      head: toSectionRecord(head),
      torso: toSectionRecord(torso),
      legs: toSectionRecord(legs),
    };
    const contributorProfileIds: [string, string, string] = [
      head.contributorProfileId,
      torso.contributorProfileId,
      legs.contributorProfileId,
    ];
    const contributorDisplayNames: [string, string, string] = [
      head.contributorDisplayName,
      torso.contributorDisplayName,
      legs.contributorDisplayName,
    ];

    const monsterAssetData: MonsterAssetDataObject = {
      schemaVersion: 1,
      monsterId,
      name: entry.name ?? "",
      birthdate: entry.birthdate ?? Date.now(),
      imageUrl,
      contributorProfileIds,
      contributorDisplayNames,
      sections: sectionRecords,
    };

    // 3. Drop the world asset.
    const droppedAsset = await dropMonsterAsset({
      credentials,
      visitor,
      monsterId,
      imageUrl,
      clickableLinkBase,
      monsterAssetData,
    });
    const monsterAssetId = droppedAsset.id as string;

    // 4. Roster migration + 200-cap eviction.
    await keyAsset.fetchDataObject();
    const dataObject = keyAsset.dataObject as KeyAssetDataObject;
    const window = dataObject.currentSubmissionWindow ?? {
      windowId: "",
      startAt: 0,
      endAt: 0,
      eligibleMonsterIds: [] as string[],
    };
    const eligibleIds = new Set(window.eligibleMonsterIds ?? []);
    eligibleIds.add(monsterId);

    // Compute cap-eviction on the WRITE side (using the freshest roster including this monster).
    const nextRoster = { ...(dataObject.monsters ?? {}) };
    nextRoster[monsterId] = {
      ...nextRoster[monsterId],
      monsterAssetId,
      imageUrl,
      inProgressSections: undefined as any, // clear from roster
    };
    const eviction = evictFinishedIfCapped(nextRoster);
    const rosterAfterCap = eviction.changed ? eviction.monsters : nextRoster;

    await keyAsset.updateDataObject(
      {
        monsters: rosterAfterCap,
        currentSubmissionWindow: { ...window, eligibleMonsterIds: Array.from(eligibleIds) },
      },
      {},
    );

    // 5. Fan out enriched contributedMonsters metadata to every contributor's
    // visitor data. Caller uses Visitor (self-write); the two peers use User
    // (foreign-profile writes).
    const contributionEnrichment: Partial<MonsterMashVisitorData["contributedMonsters"][string]> = {
      monsterAssetId,
      name: entry.name ?? "",
      imageUrl,
      birthdate: entry.birthdate ?? Date.now(),
      contributorProfileIds,
      contributorDisplayNames,
    };

    for (const profileId of contributorProfileIds) {
      const isCaller = profileId === credentials.profileId;
      try {
        if (isCaller && visitor) {
          await patchVisitorContribution(visitor, credentials, monsterId, contributionEnrichment);
        } else {
          const user: UserInterface = await User.create({ credentials: { ...credentials, profileId } });
          await patchVisitorContribution(user, credentials, monsterId, contributionEnrichment);
        }
      } catch (error) {
        console.warn(`finalizeMonster: could not enrich contributedMonsters for ${profileId}`, error);
      }
    }

    // 6. Fire completion banners for the two non-caller contributors so their
    // next-open surfaces the blue "your section finished the monster!" banner.
    const peerProfileIds = contributorProfileIds.filter((id) => id !== credentials.profileId);
    if (peerProfileIds.length > 0) {
      await enqueueCompletionBannersForProfiles(
        credentials,
        peerProfileIds,
        {
          monsterId,
          monsterName: entry.name ?? "",
          completedAt: entry.birthdate ?? Date.now(),
        },
        visitor,
      ).catch((error) => console.warn("finalizeMonster: completion banner enqueue failed", error));
    }

    return { imageUrl, monsterAssetId, monsterAssetData };
  } catch (error) {
    throw standardizeError(error);
  }
};

const patchVisitorContribution = async (
  target: VisitorInterface | UserInterface,
  credentials: Credentials,
  monsterId: string,
  enrichment: Partial<MonsterMashVisitorData["contributedMonsters"][string]>,
) => {
  const raw = ((await target.fetchDataObject()) || {}) as VisitorDataObjectType;
  const scopedKey = `${credentials.urlSlug}-${credentials.sceneDropId}`;
  const scoped = (raw[scopedKey] as MonsterMashVisitorData | undefined) ?? undefined;
  const existingContribution = scoped?.contributedMonsters?.[monsterId] ?? {
    section: "head" as Section,
    submittedAt: Date.now(),
  };
  const nextContribution = { ...existingContribution, ...enrichment, completedAt: enrichment.birthdate };
  const nextScoped: MonsterMashVisitorData = {
    ...(scoped ?? emptyScoped()),
    contributedMonsters: {
      ...(scoped?.contributedMonsters ?? {}),
      [monsterId]: nextContribution,
    },
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

const toSectionRecord = (r: {
  contributorProfileId: string;
  contributorDisplayName: string;
  submittedAt: number;
  parts: { [categoryId: string]: string };
  nameToken: string;
  sectionImageUrl?: string;
}): SectionRecord => ({
  contributorProfileId: r.contributorProfileId,
  contributorDisplayName: r.contributorDisplayName,
  submittedAt: r.submittedAt,
  parts: r.parts,
  nameToken: r.nameToken,
  sectionImageUrl: r.sectionImageUrl,
});
