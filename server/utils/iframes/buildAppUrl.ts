import { Credentials } from "../../types/index.js";
import { getBaseUrl } from "../getBaseUrl.js";

/**
 * Build a Monster Mash iframe URL that carries the caller's interactive
 * credentials AND any extra params (e.g. `screen`, `monsterId`, `section`).
 *
 * Used whenever we hand the visitor a new iframe (e.g. modal → drawer
 * transition when Create/Join/Resume opens the Monster Builder). Every
 * app iframe requires the same set of interactive params so `getCredentials`
 * on the server can validate them.
 */
export const buildAppUrl = (
  host: string,
  credentials: Credentials,
  extraParams: Record<string, string | number | undefined | null> = {},
): string => {
  const base = getBaseUrl(host);
  const params: Record<string, string | number | undefined | null> = {
    // Full credentials — every field the Topia platform normally injects into
    // the iframe URL is passed through so the new iframe can call the API.
    assetId: credentials.assetId,
    displayName: credentials.displayName,
    identityId: credentials.identityId,
    interactiveNonce: credentials.interactiveNonce,
    interactivePublicKey: credentials.interactivePublicKey,
    profileId: credentials.profileId,
    sceneDropId: credentials.sceneDropId,
    uniqueName: credentials.uniqueName,
    urlSlug: credentials.urlSlug,
    username: credentials.username,
    visitorId: credentials.visitorId,
    ...extraParams,
  };
  const query = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return `${base}/?${query}`;
};
