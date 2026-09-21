import { useContext, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

// pages
import { MainApp } from "./MainApp";
import { MonsterBuilder } from "./MonsterBuilder";
import { SingleMonsterView } from "./SingleMonsterView";
import { Trophy } from "./Trophy";

// context
import { GlobalDispatchContext, GlobalStateContext } from "@/context/GlobalContext";
import { ErrorType } from "@/context/types";

// utils
import { backendAPI, setErrorMessage, setMainAppState } from "@/utils";

/**
 * Router-level "Home" — dispatched into by App.tsx. Reads `?screen=` to pick
 * a surface. Epic 1 shipped MainApp only; Epic 2 adds the `builder` branch.
 * Later epics add `single-monster`, `trophy`, `how-to`.
 */
export const Home = () => {
  const dispatch = useContext(GlobalDispatchContext);
  const { hasInteractiveParams } = useContext(GlobalStateContext);
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);

  const screen = searchParams.get("screen") ?? "main";

  useEffect(() => {
    if (!hasInteractiveParams) return;
    // Pass forceRefreshInventory through — Topia sets this when badges are updated.
    const forceRefreshInventory = searchParams.get("forceRefreshInventory") === "true";
    backendAPI
      .get("/main-app", { params: { forceRefreshInventory } })
      .then((response) => {
        if (response?.data?.success && response.data.data) {
          setMainAppState(dispatch, response.data.data);
        }
      })
      .catch((error) => setErrorMessage(dispatch, error as ErrorType))
      .finally(() => setIsLoading(false));
  }, [hasInteractiveParams, dispatch, searchParams]);

  if (screen === "builder") {
    const monsterId = searchParams.get("monsterId") ?? "";
    const section = (searchParams.get("section") as "head" | "torso" | "legs") ?? "head";
    return <MonsterBuilder isLoading={isLoading} monsterId={monsterId} section={section} />;
  }

  if (screen === "single-monster") {
    const monsterId = searchParams.get("monsterId") ?? "";
    return <SingleMonsterView monsterId={monsterId} />;
  }

  if (screen === "trophy") {
    return <Trophy />;
  }

  return <MainApp isLoading={isLoading} />;
};

export default Home;
