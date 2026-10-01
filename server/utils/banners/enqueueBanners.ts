import { UserInterface, VisitorInterface } from "@rtsdk/topia";
import { MonsterMashVisitorData, Place, VisitorDataObjectType } from "@shared/types/index.js";
import { Credentials } from "../../types/index.js";
import { createEmptyVisitorData } from "../getVisitor.js";
import { User } from "../topiaInit.js";

/**
 * Fan-out helpers for the two banner-queue types:
 *   - Win banners: fired when a vote cycle closes and this profile
 *     contributed to a winning monster.
 *   - Completion banners: fired when the third section of a monster
 *     this profile helped build lands.
 *
 * Both queues live on each contributor's per-instance visitor dataObject
 * (Visitor for the caller; User class for foreign profiles). Consumed by
 * the client on first-open — see `handleAcknowledgeBanners`.
 */

interface WinBannerEntry {
  monsterId: string;
  category: string;
  place: Place;
  awardedAt: number;
}
interface CompletionBannerEntry {
  monsterId: string;
  monsterName: string;
  completedAt: number;
}

const scopedKey = (credentials: Credentials): string => `${credentials.urlSlug}-${credentials.sceneDropId}`;

const patchQueues = async (
  target: VisitorInterface | UserInterface,
  credentials: Credentials,
  patch: (data: MonsterMashVisitorData) => MonsterMashVisitorData,
) => {
  const raw = ((await target.fetchDataObject()) || {}) as VisitorDataObjectType;
  const key = scopedKey(credentials);
  const scoped = (raw[key] as MonsterMashVisitorData | undefined) ?? createEmptyVisitorData();
  const next = patch(scoped);
  await target.updateDataObject({ [key]: next }, {});
};

/**
 * Enqueue N win-banners onto each profile's visitor dataObject in a SINGLE
 * write per profile. Callers pass a `profileId → banners[]` map so we don't
 * write the same visitor twice when they're a contributor to multiple
 * freshly-crowned winners in the same batch.
 *
 * Also stamps each banner's award onto `contributedMonsters[monsterId].awards`
 * for that contributor — the Gallery's "Show only my monsters" filter reads
 * from the visitor's contributedMonsters (so evicted own-monsters still
 * surface), and that path uses `awards[0]` as the ribbon. Without this
 * fanout the "mine + winners" case silently returns zero cards.
 */
export const enqueueWinBannersByProfile = async (
  credentials: Credentials,
  bannersByProfileId: Map<string, WinBannerEntry[]>,
  callerVisitor: VisitorInterface | null,
) => {
  for (const [profileId, banners] of bannersByProfileId) {
    if (banners.length === 0) continue;
    try {
      const isCaller = profileId === credentials.profileId && !!callerVisitor;
      const target = isCaller
        ? (callerVisitor as VisitorInterface)
        : await User.create({ profileId, credentials: { ...credentials, profileId } });
      await patchQueues(target, credentials, (scoped) => {
        const nextContributed = { ...(scoped.contributedMonsters ?? {}) };
        for (const b of banners) {
          const existing = nextContributed[b.monsterId];
          if (!existing) continue; // profile didn't contribute to this monster — nothing to stamp.
          const award = { category: b.category, place: b.place, awardedAt: b.awardedAt };
          // De-dupe: skip if the same award (same monster + category + place)
          // is already present. advanceWeeklyCycle normally only fires once
          // per monster, but a second main-app open mid-fanout could re-enter.
          const alreadyAwarded = (existing.awards ?? []).some(
            (a) => a.category === award.category && a.place === award.place,
          );
          nextContributed[b.monsterId] = alreadyAwarded
            ? existing
            : { ...existing, awards: [...(existing.awards ?? []), award] };
        }
        return {
          ...scoped,
          contributedMonsters: nextContributed,
          pendingWinBanners: [...(scoped.pendingWinBanners ?? []), ...banners],
        };
      });
    } catch (error) {
      console.warn(`enqueueWinBannersByProfile: could not enqueue for ${profileId}`, error);
    }
  }
};

export const enqueueCompletionBannersForProfiles = async (
  credentials: Credentials,
  profileIds: string[],
  entry: CompletionBannerEntry,
  callerVisitor: VisitorInterface | null,
) => {
  for (const profileId of profileIds) {
    try {
      const isCaller = profileId === credentials.profileId && !!callerVisitor;
      const target = isCaller
        ? (callerVisitor as VisitorInterface)
        : await User.create({ profileId, credentials: { ...credentials, profileId } });
      await patchQueues(target, credentials, (scoped) => ({
        ...scoped,
        pendingCompletionBanners: [...(scoped.pendingCompletionBanners ?? []), entry],
      }));
    } catch (error) {
      console.warn(`enqueueCompletionBannersForProfiles: could not enqueue for ${profileId}`, error);
    }
  }
};
