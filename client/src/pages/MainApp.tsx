import { useContext } from "react";

// components
import { BannerStack, CreateTab, GalleryTab, PageContainer, TabBar, VoteTab } from "@/components";

// context
import { GlobalStateContext } from "@/context/GlobalContext";

interface MainAppProps {
  isLoading: boolean;
}

/**
 * Main modal surface — Monster Mash root inside the Topia iframe.
 *
 * Epic 1 renders:
 *   - Modal header with app name + close-affordance (X is provided by Topia's iframe chrome).
 *   - BannerStack (empty until Epic 7).
 *   - Tab bar (Create / Gallery / Vote).
 *   - Empty tab panels (populated in Epics 4/5/6).
 */
export const MainApp = ({ isLoading }: MainAppProps) => {
  const { activeTab } = useContext(GlobalStateContext);

  return (
    <div className="p-3 bg-white rounded-lg shadow-md">
      <PageContainer isLoading={isLoading}>
        <div className="w-full flex flex-col gap-4">
          <header className="flex flex-col gap-1">
            <h2 className="h2">Monster Mash</h2>
            <p className="p2">Create and vote with your friends!</p>
          </header>

          <BannerStack />

          <TabBar />

          <div className="mt-2">
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
