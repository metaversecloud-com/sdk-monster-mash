import { MIN_POOL_SIZE_FOR_VOTE, STORED_WINNERS_MAX, VOTING_CATEGORY_BY_ID } from "@shared/content/monsterMash.js";
import {
  KeyAssetDataObject,
  Place,
  StoredWinner,
  SubmissionWindow,
  VoteCycle,
} from "@shared/types/index.js";
import { computeWinners } from "./computeWinners.js";
import { currentSubmissionWindow } from "./computeWindows.js";

export interface WeeklyAdvanceResult {
  next: {
    currentSubmissionWindow: SubmissionWindow;
    currentVoteCycle: VoteCycle | null;
    storedWinners: StoredWinner[];
    categorySchedule: KeyAssetDataObject["categorySchedule"];
  };
  changed: boolean;
  /** Winners just crowned (empty when no cycle closed this call). */
  freshlyCrownedWinners: StoredWinner[];
}

/**
 * Opportunistic weekly transition. Called from `handleGetMainApp` on every
 * open — if we've crossed into a new ET week since the last write, we:
 *
 *   1. Close the current submission window (freeze `eligibleMonsterIds`).
 *   2. Close the current vote cycle (if any) — compute top-3 winners,
 *      append to storedWinners, tell caller so the finalize side can
 *      grant badges + enqueue banners.
 *   3. Open the new submission window for the week we've just entered.
 *   4. If the previous window has ≥ MIN_POOL_SIZE_FOR_VOTE monsters, open a
 *      fresh cycle with the next category from the rotation.
 *
 * Idempotent — if we're still in the same window, returns `changed: false`.
 */
export const advanceWeeklyCycle = (
  keyAssetDataObject: KeyAssetDataObject,
  now: number = Date.now(),
): WeeklyAdvanceResult => {
  const activeWindow = keyAssetDataObject.currentSubmissionWindow;
  const nowWindow = currentSubmissionWindow(now);
  const alreadyCurrent = activeWindow?.windowId === nowWindow.windowId;
  const weeklyVotingEnabled = keyAssetDataObject.weeklyVotingEnabled;

  if (alreadyCurrent) {
    return {
      next: {
        currentSubmissionWindow: activeWindow,
        currentVoteCycle: keyAssetDataObject.currentVoteCycle ?? null,
        storedWinners: keyAssetDataObject.storedWinners ?? [],
        categorySchedule: keyAssetDataObject.categorySchedule ?? { orderIds: [], nextIndex: 0 },
      },
      changed: false,
      freshlyCrownedWinners: [],
    };
  }

  // Step 1 + 2: close the previous week.
  const previousWindow = activeWindow;
  const previousCycle = keyAssetDataObject.currentVoteCycle ?? null;

  let freshlyCrownedWinners: StoredWinner[] = [];
  let updatedStoredWinners = [...(keyAssetDataObject.storedWinners ?? [])];

  if (previousCycle && weeklyVotingEnabled) {
    // Build birthdates map so ties break by earliest.
    const birthdates = new Map<string, number>();
    const monsters = keyAssetDataObject.monsters ?? {};
    for (const [id, entry] of Object.entries(monsters)) {
      if (entry?.birthdate) birthdates.set(id, entry.birthdate);
    }
    const excluded = new Set((keyAssetDataObject.storedWinners ?? []).map((w) => w.monsterId));

    const winners = computeWinners(previousCycle, birthdates, excluded);
    freshlyCrownedWinners = winners.map((w) => {
      const entry = monsters[w.monsterId];
      const stored: StoredWinner = {
        monsterId: w.monsterId,
        category: previousCycle.category,
        place: w.place as Place,
        awardedAt: now,
        contributorProfileIds: entry?.contributorProfileIds ?? [],
        snapshotName: entry?.name,
        snapshotImageUrl: entry?.imageUrl,
      };
      return stored;
    });

    updatedStoredWinners = [...updatedStoredWinners, ...freshlyCrownedWinners];
    // Trim to STORED_WINNERS_MAX (rolling window).
    if (updatedStoredWinners.length > STORED_WINNERS_MAX) {
      updatedStoredWinners = updatedStoredWinners.slice(-STORED_WINNERS_MAX);
    }
  }

  // Step 3: open a new submission window (already computed).
  const nextSubmissionWindow: SubmissionWindow = { ...nowWindow };

  // Step 4: open a fresh vote cycle if the previous window has enough monsters.
  const prevEligible = previousWindow?.eligibleMonsterIds ?? [];
  let nextCategoryIndex = keyAssetDataObject.categorySchedule?.nextIndex ?? 0;
  const categoryOrder = keyAssetDataObject.categorySchedule?.orderIds ?? [];
  let nextVoteCycle: VoteCycle | null = null;

  if (weeklyVotingEnabled && prevEligible.length >= MIN_POOL_SIZE_FOR_VOTE && categoryOrder.length > 0) {
    const categoryId = categoryOrder[nextCategoryIndex % categoryOrder.length];
    // Skip categories the schedule points at that no longer exist.
    if (VOTING_CATEGORY_BY_ID[categoryId]) {
      nextVoteCycle = {
        cycleId: `${nowWindow.windowId}-vote`,
        category: categoryId,
        startAt: nowWindow.startAt,
        endAt: nowWindow.endAt,
        poolMonsterIds: [...prevEligible],
        tallies: {},
        totalMatchupsServed: 0,
      };
      nextCategoryIndex = (nextCategoryIndex + 1) % categoryOrder.length;
    }
  }

  return {
    next: {
      currentSubmissionWindow: nextSubmissionWindow,
      currentVoteCycle: nextVoteCycle,
      storedWinners: updatedStoredWinners,
      categorySchedule: {
        orderIds: categoryOrder,
        nextIndex: nextCategoryIndex,
      },
    },
    changed: true,
    freshlyCrownedWinners,
  };
};
