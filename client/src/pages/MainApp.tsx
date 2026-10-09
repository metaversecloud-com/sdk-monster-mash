import { useContext, useEffect } from "react";

// components
import {
  BannerStack,
  CreateTab,
  GalleryTab,
  Logo,
  NextCategoryLine,
  PageContainer,
  TabBar,
  VoteTab,
} from "@/components";

// context
import { GlobalStateContext } from "@/context/GlobalContext";

// utils
import { backendAPI } from "@/utils";

interface MainAppProps {
  isLoading: boolean;
}

export const MainApp = ({ isLoading }: MainAppProps) => {
  const { activeTab, hasInteractiveParams } = useContext(GlobalStateContext);

  // Fire `{create|gallery|vote}Tab_viewed` whenever the active tab changes
  // (and on first mount for the default tab). Fire-and-forget — server
  // dedups per profile per tab per day so a session flipping tabs rapidly
  // still only counts one view per tab per day.
  useEffect(() => {
    if (!hasInteractiveParams) return;
    backendAPI.post("/tab-view", { tab: activeTab }).catch(() => {});
  }, [activeTab, hasInteractiveParams]);

  return (
    <div className="p-2 mm-app min-h-screen">
      <PageContainer isLoading={isLoading}>
        <div className="w-full flex flex-col gap-4">
          <header className="flex items-center gap-3 flex-wrap">
            <Logo className="h-12 w-auto" />
            <p className="p2 mm-text-accent-lt">Create and vote with your friends!</p>
          </header>

          <BannerStack activeTab={activeTab} />

          <TabBar />

          <NextCategoryLine showSubmissionCutoffLabel={true} />

          <div>
            {activeTab === "create" && <CreateTab />}
            {activeTab === "gallery" && <GalleryTab />}
            {activeTab === "vote" && <VoteTab />}
          </div>
        </div>
      </PageContainer>
    </div>
  );
};

export default MainApp;
