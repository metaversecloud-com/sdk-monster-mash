import fs from "fs";
import path from "path";

/**
 * Resolve the on-disk root of the part-art tree. The parts live in the
 * client's `public/` folder, which:
 *  - Vite serves at `/parts/*` in dev
 *  - Vite copies to `client/build/parts/*` in prod, which the server then
 *    hosts via `express.static(client/build)` (see `server/index.ts`)
 *
 * The server compositor (Jimp) reads part image bytes directly from disk;
 * this helper resolves the correct root for whichever environment is live.
 * A found path is memoized — the tree doesn't move at runtime.
 *
 * We resolve from `process.cwd()` rather than `import.meta.url` so this
 * module is portable across the ESM runtime (tsx/node) and the CJS test
 * runner (ts-jest). All entry points (`npm run dev`, `npm run start`,
 * `npx jest`) start from the server package directory.
 */
let cached: string | null = null;

const candidates = (): string[] => [
  path.resolve(process.cwd(), "../client/public/parts"),
  path.resolve(process.cwd(), "../client/build/parts"),
];

export const resolvePartsRoot = (): string => {
  if (cached) return cached;
  for (const c of candidates()) {
    if (fs.existsSync(c) && fs.statSync(c).isDirectory()) {
      cached = c;
      return cached;
    }
  }
  throw new Error(
    `resolvePartsRoot: no parts directory found. Tried:\n  - ${candidates().join("\n  - ")}`,
  );
};

/** Test-only: reset the memoized path between suites. */
export const __resetPartsRootCache = (): void => {
  cached = null;
};
