import { useContext, useMemo } from "react";

// context
import { GlobalStateContext } from "@/context/GlobalContext";

// shared
import { VOTING_CATEGORIES } from "@shared/content/monsterMash";

/**
 * Only surfaces when weekly voting is on and there is at least one defined
 * category to rotate to. The rotation order is `VOTING_CATEGORIES`; the
 * server only persists a `nextIndex` pointer modulo that length.
 */
export const NextCategoryLine = ({ showSubmissionCutoffLabel }: { showSubmissionCutoffLabel: boolean }) => {
  const { mainApp } = useContext(GlobalStateContext);

  const nextCategory = useMemo(() => {
    if (!mainApp?.weeklyVotingEnabled) return null;
    if (VOTING_CATEGORIES.length === 0) return null;
    const nextIndex = mainApp.categoryNextIndex ?? 0;
    const def = VOTING_CATEGORIES[nextIndex % VOTING_CATEGORIES.length];
    return def?.label ?? null;
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
