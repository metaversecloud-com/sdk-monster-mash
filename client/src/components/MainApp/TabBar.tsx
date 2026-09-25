import { useContext } from "react";

// context
import { useBusy } from "@/context/BusyContext";
import { GlobalDispatchContext, GlobalStateContext } from "@/context/GlobalContext";
import { SET_ACTIVE_TAB, TabId } from "@/context/types";

const TABS: readonly { id: TabId; label: string }[] = [
  { id: "create", label: "Create" },
  { id: "gallery", label: "Gallery" },
  { id: "vote", label: "Vote" },
];

export const TabBar = () => {
  const dispatch = useContext(GlobalDispatchContext);
  const { activeTab } = useContext(GlobalStateContext);
  const { isBusy } = useBusy();

  return (
    <div className="flex justify-center border-b border-gray-200 mt-2" role="tablist" aria-label="Monster Mash">
      {TABS.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-controls={`monster-mash-tab-${tab.id}`}
            id={`monster-mash-tab-btn-${tab.id}`}
            className={`btn ${isActive ? "" : "btn-outline"} min-w-[120px] mx-1 -mb-px`}
            onClick={() => dispatch?.({ type: SET_ACTIVE_TAB, payload: { activeTab: tab.id } })}
            disabled={isBusy}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};

export default TabBar;
