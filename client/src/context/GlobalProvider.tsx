import { useReducer } from "react";
import { globalReducer } from "./reducer";
import GlobalState from "./GlobalState";
import { BusyProvider } from "./BusyContext";
import { initialState } from "./constants";

const GlobalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(globalReducer, initialState);

  return (
    <GlobalState initialState={state} dispatch={dispatch}>
      <BusyProvider>{children}</BusyProvider>
    </GlobalState>
  );
};

export default GlobalProvider;
