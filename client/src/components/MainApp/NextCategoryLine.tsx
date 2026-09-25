import { useContext, useMemo } from "react";

// context
import { GlobalStateContext } from "@/context/GlobalContext";

// shared
import { VOTING_CATEGORY_BY_ID } from "@shared/content/monsterMash";

/**
 * Small single-line advisory rendered just below the tab bar (NOT a banner
 * card). Per spec: "Below the tabs, a single line of small text (not a
 * banner): Next week's voting category: [category] — FINISH your monsters
 * by [day, time ET] to enter them in next week's vote!".
 *
 * Only surfaces when weekly voting is on, a next-category schedule exists,
 * and no vote cycle is currently running (an active countdown banner is
 * shown by BannerStack instead).
 */
export const NextCategoryLine = () => {
  const { mainApp } = useContext(GlobalStateContext);

  const nextCategory = useMemo(() => {
    if (!mainApp?.weeklyVotingEnabled) return null;
    const schedule = (mainApp as any)?.categorySchedule as
      | { orderIds: string[]; nextIndex: number }
      | undefined;
    if (!schedule?.orderIds?.length) return null;
    const id = schedule.orderIds[schedule.nextIndex % schedule.orderIds.length];
    return VOTING_CATEGORY_BY_ID[id]?.label ?? id;
  }, [mainApp]);

  const submissionCutoffLabel = useMemo(() => {
    const endAt = mainApp?.currentSubmissionWindow?.endAt;
    if (!endAt) return "Sat 11:59 PM ET";
    return `${new Date(endAt).toLocaleString(undefined, {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
    })} ET`;
  }, [mainApp]);

  const cycleActive = !!mainApp?.currentVoteCycle && (mainApp.currentVoteCycle.endAt ?? 0) > Date.now();
  if (cycleActive) return null;
  if (!nextCategory) return null;

  return (
    <p className="text-xs text-gray-600 text-center px-2 py-1">
      Next week's voting category: <strong>{nextCategory}</strong> — FINISH your monsters by {submissionCutoffLabel} to
      enter them in next week's vote!
    </p>
  );
};

export default NextCategoryLine;
