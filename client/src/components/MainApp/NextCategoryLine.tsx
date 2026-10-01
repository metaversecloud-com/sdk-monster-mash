import { useContext, useMemo } from "react";

// context
import { GlobalStateContext } from "@/context/GlobalContext";

// shared
import { VOTING_CATEGORY_BY_ID } from "@shared/content/monsterMash";

/**
 * Small single-line advisory rendered just below the tab bar (NOT a banner
 * card).
 * Only surfaces when weekly voting is on and a next-category schedule exists
 */
export const NextCategoryLine = () => {
  const { mainApp } = useContext(GlobalStateContext);

  const nextCategory = useMemo(() => {
    if (!mainApp?.weeklyVotingEnabled) return null;
    const schedule = (mainApp as any)?.categorySchedule as { orderIds: string[]; nextIndex: number } | undefined;
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

  if (!nextCategory) return null;

  return (
    <p className="text-xs mm-text-muted text-center px-2 py-1">
      Next week's voting category: <strong className="mm-text-white">{nextCategory}</strong> - FINISH your monsters by{" "}
      {submissionCutoffLabel} to enter them in next week's vote!
    </p>
  );
};

export default NextCategoryLine;
