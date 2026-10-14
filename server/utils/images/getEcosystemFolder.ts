/**
 * Map the request's hostname to the folder we drop composed monsters into
 * under `userUploads/`. Each deployment of this app gets its own folder so
 * the shared bucket can be audited / cleaned per-ecosystem without
 * cross-tenant guesswork.
 *
 * Add a new entry here when a new deployment URL is cut over. Unknown
 * hostnames (local dev, a fresh preview URL, a one-off script) fall back
 * to `"other"` so uploads still succeed instead of silently landing at
 * the bucket root.
 */
const HOST_TO_ECOSYSTEM: Record<string, string> = {
  "mmash0-prod-sspace.schoolspace.io": "sspace",
  "mmash0-prod-stride.topia-rtsdk.com": "stride",
  "mmash0-prod-topia.topia-rtsdk.com": "topiaProd",
  "monstermash0-dev-topia.topia-rtsdk.com": "topiaDev",
};

export const getEcosystemFolder = (host: string | undefined): string => {
  if (!host) return "other";
  // `req.hostname` is already port-stripped on Express; strip anyway to be
  // defensive against callers passing a full "host:port" string.
  const bare = host.split(":")[0].toLowerCase();
  return HOST_TO_ECOSYSTEM[bare] ?? "other";
};
