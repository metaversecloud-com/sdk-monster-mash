import { useContext, useMemo } from "react";

// context
import { GlobalStateContext } from "@/context/GlobalContext";

// shared
import { VOTING_CATEGORY_BY_ID } from "@shared/content/monsterMash";

/**
 * Only surfaces when weekly voting is on and a next-category schedule exists
 */
export const NextCategoryLine = ({ showSubmissionCutoffLabel }: { showSubmissionCutoffLabel: boolean }) => {
  const { mainApp } = useContext(GlobalStateContext);

  const nextCategory = useMemo(() => {
    if (!mainApp?.weeklyVotingEnabled) return null;
    const schedule = mainApp.categorySchedule;
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
    <p className="text-xs mm-text-muted text-center">
      Next week's voting category: <strong className="mm-text-white">{nextCategory}</strong>
      {showSubmissionCutoffLabel &&
        ` - FINISH your monsters by 
      ${submissionCutoffLabel} to enter them in next week's vote!`}
    </p>
  );
};

export default NextCategoryLine;
