// Per-app settings for the shared platform tests in tests/platform. Every app edits this file;
// the platform specs themselves stay identical across SDK apps.

/**
 * Bugs a route still has, each set to its tracking reason (e.g. "EXP-429: ..."). The matching
 * platform test is marked test.fail: it passes while the bug exists and fails once it's fixed, so
 * the entry is removed together with the fix. Leave out what the route doesn't have.
 */
export type KnownBugs = {
  /** The response contains the interactive secret or a signed InteractiveJWT. */
  leaksSecret?: string;
  /** A request without session credentials succeeds. */
  acceptsMissingCredentials?: string;
  /** Credentials signed for another app's public key are accepted. */
  acceptsForeignCredentials?: string;
  /** Bad credentials fail later on a Topia call instead of with a credential error. */
  unnamedCredentialError?: string;
};

export type RouteSpec = {
  method: "get" | "post" | "put" | "delete";
  /** Path under basePath, without the query string. */
  path: string;
  /** Where the router is mounted. Default "/api"; e.g. "/webhook" for a separate webhook router. */
  basePath?: string;
  /**
   * Where the route reads the session credentials. "query" (default) is the iframe's backendAPI call.
   * "body": webhooks (asset clicks, zone events) get them as top-level fields of the JSON body, and
   * read them with getCredentials(req.body). The platform tests then merge them into `data`.
   */
  credentialsIn?: "query" | "body";
  data?: Record<string, unknown>;
  knownBugs?: KnownBugs;
};

// getCredentials (protected file) returns { error } instead of throwing, so every route that
// uses it has this bug until it's fixed there.
const GET_CREDENTIALS_DOESNT_THROW = "EXP-428 #6: getCredentials doesn't throw";

/**
 * API routes that read the session credentials (getCredentials). Each one must reject missing or
 * foreign credentials and must never send the interactive secret to the browser. List them all.
 *
 * Except server-sent-event streams (e.g. GET /sse): with valid credentials the response never ends, so
 * the platform tests can't read its body and time out. Cover an SSE route's credential checks in
 * tests/app instead (open it with page.request or fetch + AbortController and check the status).
 */
const bugs: KnownBugs = { unnamedCredentialError: GET_CREDENTIALS_DOESNT_THROW };
// These two only make best-effort Topia calls (iframe swap, analytics) and swallow their errors, so a
// request with no or foreign credentials still answers success.
const swallowsCredentialErrors: KnownBugs = {
  ...bugs,
  acceptsMissingCredentials: "EXP-MM: answers success without credentials",
  acceptsForeignCredentials: "EXP-MM: answers success with foreign credentials",
};

export const CREDENTIALED_ROUTES: RouteSpec[] = [
  { method: "get", path: "/main-app", knownBugs: bugs },
  { method: "post", path: "/main-app/return", knownBugs: swallowsCredentialErrors },
  { method: "post", path: "/monsters/start", knownBugs: bugs },
  { method: "post", path: "/monsters/m1/claim", data: { section: "head" }, knownBugs: bugs },
  { method: "post", path: "/monsters/m1/section", data: { section: "head", picks: {}, nameToken: "Harold" }, knownBugs: bugs },
  { method: "post", path: "/monsters/m1/draft", data: { section: "head", picks: {} }, knownBugs: bugs },
  { method: "post", path: "/monsters/m1/abandon", knownBugs: bugs },
  { method: "post", path: "/monsters/m1/resume", data: { section: "head" }, knownBugs: bugs },
  { method: "delete", path: "/monsters/m1", knownBugs: bugs },
  { method: "get", path: "/gallery", knownBugs: bugs },
  { method: "get", path: "/monsters/m1", knownBugs: bugs },
  { method: "post", path: "/monsters/m1/open", knownBugs: bugs },
  { method: "post", path: "/monsters/m1/download", knownBugs: bugs },
  { method: "post", path: "/tab-view", data: { tab: "create" }, knownBugs: swallowsCredentialErrors },
  { method: "get", path: "/vote", knownBugs: bugs },
  { method: "post", path: "/vote/cast", data: { winnerMonsterId: "m1", loserMonsterId: "m2" }, knownBugs: bugs },
  { method: "post", path: "/admin/vote/start-new-cycle", knownBugs: bugs },
  { method: "post", path: "/banners/acknowledge", knownBugs: bugs },
  { method: "get", path: "/trophy", knownBugs: bugs },
  { method: "post", path: "/leaderboard/reset", knownBugs: bugs },
  { method: "put", path: "/admin/settings", data: { weeklyVotingEnabled: false }, knownBugs: bugs },
];

/**
 * Page the app opens in its iframe; the platform tests load it with valid credentials. null if the app
 * has no page (no client/, driven only by webhooks): the platform tests that load a page are skipped.
 */
export const ENTRY_PAGE: string | null = "/";

/** Bugs seen when loading ENTRY_PAGE (only leaksSecret applies). */
export const ENTRY_PAGE_KNOWN_BUGS: Pick<KnownBugs, "leaksSecret"> = {};

/** Text the app shell's HTML must contain. Change it if the app isn't a React root (e.g. Unity). */
export const APP_SHELL_MARKER = 'id="root"';
