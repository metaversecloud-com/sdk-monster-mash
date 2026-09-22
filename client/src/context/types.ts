import { ContentPayload, MainAppResponseData, VisitorSummary } from "@shared/types/index";

export const SET_HAS_INTERACTIVE_PARAMS = "SET_HAS_INTERACTIVE_PARAMS";
export const SET_MAIN_APP_STATE = "SET_MAIN_APP_STATE";
export const SET_ACTIVE_TAB = "SET_ACTIVE_TAB";
export const SET_ERROR = "SET_ERROR";

export type InteractiveParams = {
  assetId: string;
  displayName: string;
  identityId: string;
  interactiveNonce: string;
  interactivePublicKey: string;
  profileId: string;
  sceneDropId: string;
  uniqueName: string;
  urlSlug: string;
  username: string;
  visitorId: string;
};

export type TabId = "create" | "gallery" | "vote";

export interface InitialState {
  hasInteractiveParams?: boolean;
  activeTab: TabId;
  mainApp?: MainAppResponseData;
  visitor?: VisitorSummary;
  /** Duplicated top-level of `visitor.isAdmin` because `PageContainer` (protected) reads it here. */
  isAdmin?: boolean;
  /** Runtime parts catalog served from `/api/main-app`. Everything that used to
   *  read PARTS/CATEGORIES from `@shared/content/monsterMash` reads it here. */
  content?: ContentPayload;
  error?: string;
}

export type ActionType = {
  type: string;
  payload?: Partial<InitialState> & { mainApp?: MainAppResponseData };
};

export type ErrorType =
  | string
  | {
      message?: string;
      response?: { data?: { error?: { message?: string }; message?: string } };
    };
