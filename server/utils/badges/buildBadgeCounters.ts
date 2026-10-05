import { MonsterMashVisitorData, Section } from "@shared/types/index.js";
import { BadgeCounters } from "./evaluateBadges.js";

/**
 * Project a profile's Monster Mash visitor data into the counters the badge
 * rules read.
 *
 * Most counters are derived rather than stored — `contributedMonsters`
 * already records one entry per section this profile submitted, including
 * which section it was, whether they joined someone else's monster, whether
 * their submit completed it, and any awards that monster later won. Only
 * the four things that leave no trace there are stored explicitly:
 * `monstersStarted`, `weeksStartedMonsterIn`, `votesByWeek` and the
 * long-standing vote/visit tallies.
 */
export const buildBadgeCounters = (visitorData: MonsterMashVisitorData): BadgeCounters => {
  const sectionSubmits: Partial<Record<Section, number>> = {};
  const wonCategories = new Set<string>();
  let joinedMonster = 0;
  let completeAsThird = 0;
  let awardsWon = 0;

  for (const entry of Object.values(visitorData.contributedMonsters ?? {})) {
    if (!entry) continue;
    if (entry.section) sectionSubmits[entry.section] = (sectionSubmits[entry.section] ?? 0) + 1;
    if (entry.joined) joinedMonster += 1;
    if (entry.wasThirdSection) completeAsThird += 1;
    for (const award of entry.awards ?? []) {
      awardsWon += 1;
      if (award?.category) wonCategories.add(award.category);
    }
  }

  const votesByWeek = visitorData.votesByWeek ?? {};
  const votesPerWeek = Object.values(votesByWeek);

  return {
    // building
    monstersStarted: visitorData.monstersStarted ?? 0,
    weeksStartedMonster: (visitorData.weeksStartedMonsterIn ?? []).length,
    sectionSubmits,
    joinedMonster,
    completeAsThird,

    // voting
    vote: visitorData.totalVotesCast ?? 0,
    weeksVoted: (visitorData.weeksVotedIn ?? []).length,
    votesInSingleWeek: votesPerWeek.length > 0 ? Math.max(...votesPerWeek) : 0,
    votesPerWeek,

    // visiting
    visitAppOpens: (visitorData.daysAppOpened ?? []).length,

    // winning
    wonCategories,
    awardsWon,
  };
};
