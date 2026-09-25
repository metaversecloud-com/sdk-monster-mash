import { useContext, useEffect, useState } from "react";

// components
import { BadgesTab, LeaderboardTab, Logo, PageContainer } from "@/components";

// context
import { GlobalDispatchContext, GlobalStateContext } from "@/context/GlobalContext";
import { ErrorType } from "@/context/types";

// shared
import { TrophyResponseData } from "@shared/types/index";

// utils
import { backendAPI, setErrorMessage } from "@/utils";

type TabId = "leaderboard" | "badges";

/**
 * Trophy drawer (mockup image21/24/30). Two tabs — Leaderboard | Badges.
 * Fixed-width drawer surface — reached from clicking the Trophy asset in the
 * world (`?screen=trophy`).
 */
export const Trophy = () => {
  const dispatch = useContext(GlobalDispatchContext);
  const { hasInteractiveParams } = useContext(GlobalStateContext);
  const [tab, setTab] = useState<TabId>("leaderboard");
  const [payload, setPayload] = useState<TrophyResponseData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTrophy = () => {
    setIsLoading(true);
    backendAPI
      .get("/trophy")
      .then((response) => {
        if (response?.data?.success) setPayload(response.data.data);
      })
      .catch((error) => setErrorMessage(dispatch, error as ErrorType))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    if (hasInteractiveParams) fetchTrophy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasInteractiveParams]);

  return (
    <div className="p-2 mm-app min-h-screen">
      <PageContainer isLoading={isLoading}>
        <div className="w-full flex flex-col gap-4">
          <Logo className="h-8 w-auto mx-auto" />

          <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Trophy tabs">
            {(["leaderboard", "badges"] as TabId[]).map((id) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                className={`btn ${tab === id ? "" : "btn-outline"}`}
                onClick={() => setTab(id)}
              >
                {id === "leaderboard" ? "Leaderboard" : "Badges"}
              </button>
            ))}
          </div>

          {payload && tab === "leaderboard" && (
            <LeaderboardTab
              rows={payload.leaderboard}
              callerRow={payload.callerRow}
              cap={payload.cap}
              isAdmin={payload.isAdmin}
              onAfterReset={fetchTrophy}
            />
          )}
          {payload && tab === "badges" && (
            <BadgesTab badges={payload.badges} ownedCount={payload.ownedBadgesCount} totalCount={payload.totalBadges} />
          )}
        </div>
      </PageContainer>
    </div>
  );
};

export default Trophy;
