import { VisitorInterface } from "@rtsdk/topia";
import { Credentials } from "../../types/index.js";
import { buildAppUrl } from "./buildAppUrl.js";

interface TransitionIframeInput {
  visitor: VisitorInterface;
  credentials: Credentials;
  host: string;
  /** `screen` query param the new iframe should render (e.g. "builder", "main-app"). */
  screen?: string;
  /** Any additional params to pass in the URL (monsterId, section, etc.). */
  params?: Record<string, string | number | undefined | null>;
  /** Drawer title chrome. Defaults to "Monster Mash". */
  title?: string;
  /** `true` → fixed-width drawer; `false` → wide modal. */
  shouldOpenInDrawer: boolean;
}

/**
 * Close the caller's current iframe and open a new one with the given
 * screen + params. Used both directions:
 *   - modal → drawer  (Create / Join / Resume open the Builder)
 *   - drawer → modal  ("Back to Monster Mash" returns to the main app)
 *
 * All credentials are preserved via `buildAppUrl`. Close + open target the
 * same `assetId` (the key asset). Topia routes the transition to the caller
 * only; other visitors are unaffected. Close and open are wrapped in
 * per-step try/catch so a mid-swap SDK hiccup doesn't fail the underlying
 * controller — the client can still navigate as a fallback.
 */
export const transitionIframe = async ({
  visitor,
  credentials,
  host,
  screen,
  params,
  title = "Monster Mash",
  shouldOpenInDrawer,
}: TransitionIframeInput): Promise<void> => {
  const linkParams: Record<string, string | number | undefined | null> = { ...(params ?? {}) };
  if (screen) linkParams.screen = screen;
  const link = buildAppUrl(host, credentials, linkParams);
  const droppedAssetId = credentials.assetId;
  try {
    await visitor.closeIframe(droppedAssetId);
  } catch (error) {
    console.warn("transitionIframe: closeIframe failed (non-fatal)", error);
  }
  try {
    await visitor.openIframe({
      droppedAssetId,
      link,
      shouldOpenInDrawer,
      title,
    });
  } catch (error) {
    console.warn("transitionIframe: openIframe failed (non-fatal)", error);
  }
};

/** Convenience wrapper — modal → fixed-width Builder / SingleMonsterView / Trophy drawer. */
export const transitionToDrawer = (input: Omit<TransitionIframeInput, "shouldOpenInDrawer">) =>
  transitionIframe({ ...input, shouldOpenInDrawer: true });

/** Convenience wrapper — drawer → wide Monster Mash main-app modal. */
export const transitionToMainApp = (
  input: Omit<TransitionIframeInput, "shouldOpenInDrawer" | "screen"> & { screen?: string },
) => transitionIframe({ ...input, shouldOpenInDrawer: false });
