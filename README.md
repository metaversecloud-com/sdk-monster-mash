<div align="center">
<img src="https://global-uploads.webflow.com/62e7004a0f9b3a63b980ac3c/62e70c84dd3aac06fb2ac2b6_topia-logo-blue-2x.png" style="width: 120px; margin-bottom: 20px" alt="Topia logo">
</div>

# Monster Mash

## Introduction / Summary

Monster Mash is a collaborative creature builder for Topia. Three players each build one section of a monster — head, torso, legs — from a shared catalog of parts. When the third section is submitted, the app composites the layers into a PNG, drops the finished monster into the world as its own asset, adds it to the class Gallery, and enters it into the next voting cycle.

Each Sun→Sat ET week runs one voting category (silliest, cutest, best-dressed…). Winners crowned at cycle close take a spot on the class leaderboard forever; every contributor on a winning monster earns an ecosystem badge.

## Key Features

### Canvas elements & interactions

- **Monster Mash key asset** — the one required dropped asset. `clickType: link` → the app's main modal (three tabs: Create, Gallery, Vote). Admin must set `uniqueName: MonsterMash_keyAsset` so the server can find it.
- **Finished-monster assets** — dropped by the app at monster completion. `clickType: link` → the Single Monster View drawer with Download PNG and (for admins) a Delete confirm.
- **Trophy asset (optional)** — any dropped asset the admin configures with `clickableLink` pointing at `?screen=trophy`. No required `uniqueName` — the Trophy drawer is driven entirely by the clickable link, and the leaderboard data lives on the key asset.

### Main modal — Create tab

- **Create New Monster** tile — server picks the caller's section at random and locks it.
- **Resume** tile — surfaces when the caller has an unfinished section (soft lock, 30-min TTL).
- **In-progress card grid** — one card per unfinished monster with three horizontal section slots. Each slot renders one of `Available` (Join), `Locked-by-you` (Resume), `Locked-by-others` (contributor pill), `Done` (peer art visible once the caller has contributed to the same monster).
- **Admin trash** per card with the "Delete this monster in progress?" confirm modal.

### Main modal — Gallery tab

- Card grid of finished monsters with an optional award ribbon, composited art, contributors dot-separated, `Born {date}`, per-card Download PNG.
- Green outline on cards the caller contributed to.
- Three UI controls applied as pure client-side derived state (single server fetch; no round-trip per toggle): Sort (Newest / Oldest), "Show only my monsters" (includes monsters that have rotated out of the 200-cap roster via the caller's `contributedMonsters` history), "Show only award winners".
- Admin-only Delete button next to each card's Download.

### Main modal — Vote tab (four states)

- **Running** — amber countdown pill (h:m:s), "LAST WEEK'S WINNERS · {CATEGORY}" row (hidden when there are no stored winners), category question ("Which one is the …?"), two side-by-side matchup cards + VS chip. Vote cap is **daily only** — `pool.size × 1` per ET day, resets at midnight ET or when the cycleId changes (new cycle = fresh set).
- **Scheduled** — "No vote is running right now" with the next scheduled Sunday date.
- **Not-enough-monsters** — `X of the {MIN_POOL_SIZE_FOR_VOTE} monsters needed are in the pool` + a "Go build a monster →" CTA.
- **Voting-off (admin toggled)** — "Check in with your teacher about the next vote!"

### Monster Builder drawer

- Three-section layout with a pinned live preview (dashed peer placeholders + the caller's section rendering live per `LAYER_ORDER`).
- Category accordions with a progress chip ("X of Y required"), green `✓` when picked. Optional categories (those with `allowsNone: true`) don't show a "Required" chip and don't gate the Submit button — if the user doesn't actively pick anything for them, the server auto-fills `NONE` at submit time.
- 30-name dropdown per section (head → first name, torso → last name, legs → title). The three tokens compose the monster's name at completion.
- **Legs sub-rule** — picking a `legs.legs` part with `supportsFeet: false` while feet is chosen fires the incompatibility modal.
- **Submit** confirm modal + "Cancel & release my claim".
- Auto-save: pick + name-token changes are debounced-persisted to the caller's `activeDraft` so closing the drawer and reopening resumes exactly where they left off.

### Single Monster View drawer

- Composited PNG, name, contributor attribution, Born date, award ribbon (derived from `storedWinners[monsterId]`), Download PNG (opens in new tab), Back to Monster Mash.
- Admin variant adds a Delete Monster button + confirm. Deletion removes the roster entry, drops the asset from the world, and strips the monster from any current vote pool / tallies.

### Trophy drawer

- **Leaderboard tab** — single sorted list (awards desc → monsters-contributed-to desc), top 25, caller's row highlighted and rendered outside the top-25 when needed. Admin footer: `Reset Leaderboard` (badges are NOT affected).
- **Badges tab** — `Your Badges · X of {totalBadges}`, grouped `For building` / `For voting` / `For visiting` / `For winning`. Earned = gold tile; locked = padlock. Badge catalog comes from the ecosystem inventory (`type: BADGE`), not a hardcoded list — adding or deactivating a badge in the ecosystem updates the grid without a code deploy.

### Banners

1. **Green winner banner** — "Your monster placed {1st|2nd|3rd} in {Category} in the vote that ended {date}!" with a "See Your Monster →" link that opens Gallery pre-filtered to the caller's wins.
2. **Blue completion banner** — "{Name} is complete! A monster you helped build is finished." with a "See Your Monster →" link that opens Gallery filtered to the caller's monsters.
3. **Amber countdown banner** — "{X days and Y hours} left to VOTE on last week's monsters!" with a VOTE CTA (hidden when the Vote tab is already active).

Both green + blue banners POST `/banners/acknowledge` on first view to clear the queue.

### Admin features

- Delete in-progress monster from the Create tab card.
- Delete completed monster from the Single Monster View drawer (also drops the world asset + strips it from any current vote cycle pool + tallies).
- Reset Leaderboard from the Trophy drawer.
- Weekly voting on/off toggle (Admin Settings).
- **Start New Vote Cycle** — immediately closes the current vote cycle (crowning winners if one is running) and opens a new one in the current submission window, picking the next category in rotation. Latches a success note after one click to prevent accidental re-fire.

## Required Assets with Unique Names

| Purpose                    | Unique name                       | How it's placed                                                                                                   |
| -------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Monster Mash key asset** | `MonsterMash_keyAsset`            | **Required.** World builder places manually with `clickType: link` → the app URL. Server resolves it by uniqueName. |
| **Finished-monster asset** | `MonsterMash-monster-{monsterId}` | **Dynamic.** App drops automatically at monster completion via `DroppedAsset.drop`. Do not place manually.         |
| **Trophy asset** (optional) | *(no required uniqueName)*       | Any dropped asset with `clickableLink` → `/?screen=trophy`. Opens the Trophy drawer.                               |

> **Note:** The key asset's `uniqueName` is a hard requirement — the server uses `fetchDroppedAssetsWithUniqueName` to find it on every webhook / API call. If it's missing or misspelled, nothing works. All app-dropped assets share the key asset's `sceneDropId` so scene-wide fetches cover them.

## Technical Architecture (Data Objects)

Per-instance state lives on three dataObject surfaces plus the ecosystem inventory. All caps are per instance.

### Key asset dataObject (`KeyAssetDataObject`)

The hub. Roster of every monster (in-progress + complete, index-only once finished), current submission window, current vote cycle, stored winners, admin settings, category rotation pointer, and the leaderboard cache.

- `weeklyVotingEnabled: boolean` — admin toggle.
- `monsters: { [monsterId]: MonsterIndexEntry }` — capped at 100 in-progress + 200 finished; eldest-first eviction.
- `currentSubmissionWindow: SubmissionWindow` — Sun→Sat ET containing "now"; `eligibleMonsterIds` appended on completion.
- `currentVoteCycle: VoteCycle | null` — pool + tallies; opened when the previous window's eligible pool (plus backfill from older complete monsters) hits `MIN_POOL_SIZE_FOR_VOTE`.
- `storedWinners: { [monsterId]: { category, place, awardedAt } }` — keyed by monsterId, rolling cap of `STORED_WINNERS_MAX` (200). Also the exclusion set that keeps a once-winning monster out of future pools.
- `leaderboard?: { [profileId]: "displayName|awardsWon|monstersContributedTo" }` — compact pipe-joined strings so hundreds of contributors stay well under Firestore's 1 MiB per-doc cap.
- `categoryNextIndex: number` — mod-indexed pointer into `VOTING_CATEGORIES`. The actual rotation order lives in `shared/content/monsterMash.ts` as the single source of truth; this only persists where the next cycle picks up.

Monster roster entries do **not** carry a `latestAward` field — ribbons are derived from `storedWinners[monsterId]` at response time.

### Per-monster dropped asset dataObject (`MonsterAssetDataObject`)

One per finished monster, dropped in the world at completion. Full record: name, birthdate, image URL, three contributor profileIds + display names, per-section records (parts + name tokens), and the owning `keyAssetId` so admin actions initiated from the world drawer resolve back to the right key asset.

### Visitor / User dataObject (`MonsterMashVisitorData`)

Per profile per instance, scoped under `${urlSlug}-${sceneDropId}`:

- `contributedMonsters` — `monsterId` → `{ section, submittedAt, completedAt, awards[], and post-finalize enrichment (monsterAssetId, name, imageUrl, birthdate, contributor names) }`. Persists across roster eviction so "Show only my monsters" surfaces evicted own-monsters.
- `contributedDrafts` — per-monster picks + name tokens for in-progress monsters the caller has contributed to. Cleaned up at finalize.
- `activeDraft` — the caller's live section lock (max one at a time).
- `pendingWinBanners` / `pendingCompletionBanners` — queues drained on first view via `POST /banners/acknowledge`.
- `votesCastToday`, `votesCastThisWeek`, `votesByWeek`, `totalVotesCast`, `weeksVotedIn`, `monstersStarted`, `weeksStartedMonsterIn`, `daysAppOpened` — analytics + badge counters.

## API Endpoints

### Main app + navigation

| Method | Path                 | Purpose                                                                                                                    |
| ------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/main-app`      | Modal payload (roster, window, cycle, banners, activeDraft, categoryNextIndex). Runs opportunistic weekly rollover + stale-lock expiry + orphan sweep. |
| POST   | `/api/main-app/return` | Modal → drawer transition back to the main modal (close current iframe, reopen main-app).                               |
| POST   | `/api/tab-view`      | Fire-and-forget analytic: records `createTab_viewed` / `galleryTab_viewed` / `voteTab_viewed`.                              |

### Monsters lifecycle

| Method | Path                        | Purpose                                                                                                                                                                    |
| ------ | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/monsters/start`       | Allocates monsterId, picks a random section, locks it for caller. Enforces `IN_PROGRESS_CAP` and refuses when caller already has an `activeDraft`.                          |
| POST   | `/api/monsters/:id/claim`   | Join an available section. 409 on race (section taken, caller has another draft).                                                                                          |
| POST   | `/api/monsters/:id/section` | Submit a section. On third-section landing, runs `finalizeMonster` (full-monster compose + world drop + roster migration + banner + leaderboard fanout).                   |
| POST   | `/api/monsters/:id/draft`   | Auto-save the caller's in-progress picks + name token. Fire-and-forget, debounced client-side.                                                                             |
| POST   | `/api/monsters/:id/resume`  | Reopen the Builder drawer on the caller's `activeDraft` section.                                                                                                           |
| POST   | `/api/monsters/:id/abandon` | Release the caller's claim (idempotent).                                                                                                                                   |
| DELETE | `/api/monsters/:id`         | Admin-only. Removes from roster, cleans window / cycle references; for complete monsters, deletes the world drop and clears each contributor's `contributedMonsters` entry. Body `{ shouldCloseIframe: true }` closes the drawer afterwards. |

### Gallery + single monster

| Method | Path                        | Purpose                                                                                                                                                       |
| ------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/gallery`              | Single-shot payload: union of every complete roster entry + the caller's `contributedMonsters` history. Client filters/sorts locally.                        |
| GET    | `/api/monsters/:id`         | Single Monster View payload; falls back to visitor.contributedMonsters when the monster is evicted. Also fires `monster_viewed_own` / `_other` analytic.    |
| POST   | `/api/monsters/:id/open`    | Modal → drawer transition for the Single Monster View (used by Gallery card click).                                                                           |
| POST   | `/api/monsters/:id/download`| Fire-and-forget analytic: records `monster_downloaded_own` / `_other` based on caller contribution.                                                           |

### Vote

| Method | Path                             | Purpose                                                                                                                                      |
| ------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/vote`                      | Vote-tab payload (state / countdown / matchup / last winners / caller daily-cap state).                                                      |
| POST   | `/api/vote/cast`                 | Body: `{ winnerMonsterId, loserMonsterId }`. Increments tallies, bumps caller's daily counter, returns the next matchup.                     |
| POST   | `/api/admin/vote/start-new-cycle`| Admin-only. Closes the current cycle (crowning winners if any) and opens a new one with the next category. 409 if the pool can't reach MIN. |

### Trophy + admin + banners

| Method | Path                        | Purpose                                                                                                                                              |
| ------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/trophy`               | Leaderboard (top 25 + caller's row) + badges grid (grouped by category).                                                                             |
| POST   | `/api/leaderboard/reset`    | Admin-only. Wipes the leaderboard cache (badges unaffected).                                                                                         |
| PUT    | `/api/admin/settings`       | Admin-only. Flips `weeklyVotingEnabled`. Turning off while a cycle is running also nulls the current cycle (no awards granted for it).                |
| POST   | `/api/banners/acknowledge`  | Clears pending win + completion queues for caller.                                                                                                   |

## Environment Variables

Copy `.env-example` → `.env` at the repo root:

```
INSTANCE_DOMAIN=api.topia.io
INTERACTIVE_KEY=your_interactive_key
INTERACTIVE_SECRET=your_interactive_secret
NODE_ENV=development
# Where the client + server fetch part PNGs from. Empty in dev → served from `client/public/parts/`.
PARTS_BASE_URL=
# Bucket for composed monster PNGs.
S3_BUCKET=sdk-monster-mash
# OPTIONAL: lower the vote threshold for local testing (default 10 if unset).
MIN_POOL_SIZE=4
```

The `dev` script uses `--env-file-if-exists=../.env` so Node loads `.env` into `process.env` before any module evaluates. For prod, set `MIN_POOL_SIZE` through your deploy env — it's ignored in the client bundle.

## Getting Started

```bash
npm install
npm run dev
```

- Server runs on `:3000` (Express) and serves the compiled client in production.
- Client runs on Vite's dev server in dev; point your dev key asset's `clickableLink` at it.
- Once opened in a world with valid interactive params, the app initializes both the key asset dataObject and the caller's per-instance visitor dataObject on the first `/api/main-app` call.

## For Developers

- **Content** (`shared/content/monsterMash.ts`) — `CATEGORIES` (drawer accordions), `LAYER_ORDER` (locked back → front), `NAME_TOKENS` (30 per section), `VOTING_CATEGORIES` (the vote rotation — this is the single source of truth; `categoryNextIndex` on the key asset is just a mod-indexed pointer). When new art is delivered, drop PNGs into `client/public/parts/{section}/{category}/{imageName}` or set `PARTS_BASE_URL` to point at an S3 bucket with the same layout.
- **Badges** — the catalog is the ecosystem inventory (`type: BADGE`), not a code constant. `server/utils/badges/evaluateBadges.ts` returns badges to grant given the target's counters + owned set.
- **Timezone** — hardcoded `America/New_York`. Every window and cycle rolls at Sun 00:00 ET → Sat 23:59:59 ET via `server/utils/vote/computeWindows.ts` (DST-safe).
- **Testing** — `npm test --workspace=server` runs the Jest suite under `server/tests/`. Add coverage for new routes alongside existing ones. SDK writes are mocked in `server/mocks/@rtsdk/topia.ts`.
- **Compositor** — Jimp. The full composed monster is uploaded to `monster-mash/monsters/{monsterId}.png` in `S3_BUCKET` at finalize time (no per-section upload — section preview is layered client-side from the raw part PNGs until completion).

## Plan + Spec

- Implementation plan (per-epic): [`plan.md`](./plan.md)
