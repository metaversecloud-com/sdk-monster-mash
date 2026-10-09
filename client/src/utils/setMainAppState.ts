import { Dispatch } from "react";
import { MainAppResponseData } from "@shared/types/index";
import { ActionType, SET_MAIN_APP_STATE } from "@/context/types";

export const setMainAppState = (dispatch: Dispatch<ActionType> | null, mainApp: MainAppResponseData) => {
  if (!dispatch) return;
  dispatch({ type: SET_MAIN_APP_STATE, payload: { mainApp } });
};
