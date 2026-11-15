// Builders for Monster Mash's stored state (key asset roster, vote cycle, visitor data), so a test can
// seed a world in any phase of the game. Shapes follow shared/types/*.ts.
import type { Player } from "../fixtures";

export type Section = "head" | "torso" | "legs";
export const SECTIONS: Section[] = ["head", "torso", "legs"];

/** A complete, valid set of picks per section (parts from client/public/parts). */
export const PICKS: Record<Section, Record<string, string>> = {
  head: { headShape: "alien-head", nose: "NONE", eyes: "alien-eyes", mouth: "NONE", hair: "antennas" },
  torso: { shirt: "alien-torso", arms: "alien-arms", collar: "NONE", torsoBack: "NONE" },
  legs: { legs: "alien-legs", feet: "flippers", waist: "NONE", belt: "NONE", legsBack: "NONE" },
};
export const NAME_TOKENS: Record<Section, string> = { head: "Harold", torso: "McFishy", legs: "the Magnificent" };

const ET_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const ET_WEEKDAY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" });
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "YYYY-MM-DD" of the ET Sunday that starts the week containing `now` (the app's windowId). */
export const windowIdFor = (now = Date.now()) => {
  const dow = DAYS.indexOf(ET_WEEKDAY.format(new Date(now)));
  // Noon UTC of the ET date keeps the day arithmetic clear of DST edges.
  const etDate = new Date(`${ET_DATE.format(new Date(now))}T12:00:00Z`);
  etDate.setUTCDate(etDate.getUTCDate() - dow);
  return etDate.toISOString().slice(0, 10);
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** The submission window the app considers current (bounds are approximate; only windowId is compared). */
export const currentWindow = (eligibleMonsterIds: string[] = []) => ({
  windowId: windowIdFor(),
  startAt: Date.now() - WEEK_MS / 2,
  endAt: Date.now() + WEEK_MS / 2,
  eligibleMonsterIds,
});

/** Last week's window: the next /main-app open rolls the week over. */
export const lastWeeksWindow = (eligibleMonsterIds: string[] = []) => ({
  windowId: windowIdFor(Date.now() - WEEK_MS),
  startAt: Date.now() - 2 * WEEK_MS,
  endAt: Date.now() - WEEK_MS,
  eligibleMonsterIds,
});

type Slot = { status: "available" } | { status: "locked" | "done"; by: Player | { profileId: string; displayName: string } };

/** An in-progress roster entry; sections not given are available. */
export const inProgress = (monsterId: string, slots: Partial<Record<Section, Slot>> = {}, ageMs = 60_000) => {
  const now = Date.now();
  const sections = Object.fromEntries(
    SECTIONS.map((s) => {
      const slot = slots[s];
      if (!slot || slot.status === "available") return [s, { status: "available" }];
      const base = { status: slot.status, contributorProfileId: slot.by.profileId, contributorDisplayName: slot.by.displayName };
      return [s, slot.status === "locked" ? { ...base, lockedAt: now - ageMs } : { ...base, submittedAt: now - ageMs }];
    }),
  );
  const contributorProfileIds = SECTIONS.flatMap((s) => {
    const slot = slots[s];
    return slot && slot.status === "done" ? [slot.by.profileId] : [];
  });
  return { monsterId, state: "in-progress", createdAt: now - ageMs, lastEditedAt: now - ageMs, sections, contributorProfileIds };
};

/** A finished roster entry. */
export const complete = (
  monsterId: string,
  {
    name = `Monster ${monsterId}`,
    contributors = [] as { profileId: string; displayName: string }[],
    birthdate = Date.now() - 60_000,
    timesShown,
  }: { name?: string; contributors?: { profileId: string; displayName: string }[]; birthdate?: number; timesShown?: number } = {},
) => ({
  monsterId,
  monsterAssetId: `asset-${monsterId}`,
  state: "complete",
  birthdate,
  name,
  imageUrl: `https://example.invalid/monsters/${monsterId}.png`,
  contributorProfileIds: contributors.map((c) => c.profileId),
  contributorNames: contributors.map((c) => c.displayName).join("|"),
  ...(timesShown !== undefined && { timesShown }),
});

/** A running vote cycle over `poolMonsterIds`. */
export const voteCycle = (poolMonsterIds: string[], { category = "silliest", tallies = {} as Record<string, { shown: number; wins: number }>, cycleId = `${windowIdFor()}-vote` } = {}) => ({
  cycleId,
  category,
  startAt: Date.now() - WEEK_MS / 2,
  endAt: Date.now() + WEEK_MS / 2,
  poolMonsterIds,
  tallies,
});

/** The key asset's data object (KeyAssetDataObject) with sensible defaults. */
export const keyAsset = (fields: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  timezone: "America/New_York",
  weeklyVotingEnabled: true,
  monsters: {},
  currentSubmissionWindow: currentWindow(),
  currentVoteCycle: null,
  storedWinners: {},
  categoryNextIndex: 0,
  ...fields,
});

/** Turns a list of roster entries into the `monsters` map. */
export const roster = (...entries: { monsterId: string }[]) => Object.fromEntries(entries.map((e) => [e.monsterId, e]));

/** A visitor's scoped Monster Mash data (MonsterMashVisitorData) with defaults. */
export const playerData = (fields: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  dateStarted: Date.now() - 86_400_000,
  contributedMonsters: {},
  pendingWinBanners: [],
  pendingCompletionBanners: [],
  // Already opened today, so a plain open doesn't write (tests that care set their own).
  daysAppOpened: [new Date().toISOString().slice(0, 10)],
  weeksVotedIn: [],
  votesCastThisWeek: { windowId: "", count: 0 },
  votesCastToday: { dateEt: "", count: 0 },
  totalVotesCast: 0,
  monstersStarted: 0,
  weeksStartedMonsterIn: [],
  votesByWeek: {},
  ...fields,
});

/** activeDraft for a section the player holds. */
export const draft = (monsterId: string, section: Section, picks: Record<string, string> = {}, extra: Record<string, unknown> = {}) => ({
  monsterId,
  section,
  lockedAt: Date.now() - 60_000,
  lastActivityAt: Date.now() - 60_000,
  picks,
  ...extra,
});

/** contributedDrafts entry for a submitted (not yet finalized) section. */
export const submittedDraft = (monsterId: string, section: Section) => ({
  [monsterId]: { [section]: { picks: PICKS[section], nameToken: NAME_TOKENS[section] } },
});
