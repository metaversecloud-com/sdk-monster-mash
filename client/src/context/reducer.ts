import {
  ActionType,
  CLEAR_GALLERY_DEEP_LINK,
  InitialState,
  SET_ACTIVE_TAB,
  SET_ERROR,
  SET_GALLERY_DEEP_LINK,
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
        content: payload?.mainApp?.content ?? state.content,
        error: "",
      };
    case SET_ACTIVE_TAB:
      return {
        ...state,
        activeTab: payload?.activeTab ?? state.activeTab,
      };
    case SET_GALLERY_DEEP_LINK:
      return {
        ...state,
        galleryDeepLink: payload?.galleryDeepLink,
      };
    case CLEAR_GALLERY_DEEP_LINK:
      return {
        ...state,
        galleryDeepLink: undefined,
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
