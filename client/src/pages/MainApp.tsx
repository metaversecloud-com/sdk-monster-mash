import { useContext } from "react";

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

interface MainAppProps {
  isLoading: boolean;
}

export const MainApp = ({ isLoading }: MainAppProps) => {
  const { activeTab } = useContext(GlobalStateContext);

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
          <NextCategoryLine />

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
