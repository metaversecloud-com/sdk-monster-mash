import {
  ActionType,
  InitialState,
  SET_ACTIVE_TAB,
  SET_ERROR,
  SET_HAS_INTERACTIVE_PARAMS,
  SET_MAIN_APP_STATE,
} from "./types";

const globalReducer = (state: InitialState, action: ActionType): InitialState => {
  const { type, payload } = action;
  switch (type) {
    case SET_HAS_INTERACTIVE_PARAMS:
      return { ...state, hasInteractiveParams: true };
    case SET_MAIN_APP_STATE:
      return {
        ...state,
        mainApp: payload?.mainApp,
        visitor: payload?.mainApp?.visitor,
        isAdmin: payload?.mainApp?.visitor?.isAdmin,
        error: "",
      };
    case SET_ACTIVE_TAB:
      return {
        ...state,
        activeTab: payload?.activeTab ?? state.activeTab,
      };
    case SET_ERROR:
      return {
        ...state,
        error: payload?.error,
      };
    default:
      throw new Error(`Unhandled action type: ${type}`);
  }
};

export { globalReducer };
