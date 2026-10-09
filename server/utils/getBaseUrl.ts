/**
 * Return the public base URL for THIS app given the request's host header.
 * Used to build `clickableLink` values for DroppedAsset.drop.
 *
 *   localhost  →  http://localhost:3001  (dev; matches Build-an-Asset)
 *   otherwise  →  ${INSTANCE_PROTOCOL}://${host}
 */
export const getBaseUrl = (host: string): string => {
  const protocol = process.env.INSTANCE_PROTOCOL || "https";
  if (host === "localhost" || host.startsWith("localhost:")) {
    return `http://localhost:3001`;
  }
  return `${protocol}://${host}`;
};
