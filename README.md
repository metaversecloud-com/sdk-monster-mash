<div align="center">
<img src="https://global-uploads.webflow.com/62e7004a0f9b3a63b980ac3c/62e70c84dd3aac06fb2ac2b6_topia-logo-blue-2x.png" style="width: 120px; margin-bottom: 20px" alt="Topia logo">
</div>

# Monster Mash

## Introduction / Summary

Monster Mash is a collaborative **exquisite-corpse** creature builder for Topia. Three players each build one section of a monster — head, torso, legs — from a shared catalog of parts. When the third section is submitted, the app composites the layers into a PNG, drops the finished monster into the world as its own asset, adds it to the class Gallery, and enters it into next week's vote.

Each Sun→Sat ET week runs one voting category (silliest, cutest, best-dressed…). Winners crowned Saturday night take a spot on the class leaderboard forever; every contributor on a winning monster earns an ecosystem badge.

## Key Features

### Canvas elements & interactions

- **Monster Mash key asset** (`clickType: link` → this app iframe as a wide modal): opens the main app modal with three tabs — Create, Gallery, Vote.
- **Info sign** (`clickType: link` → drawer): opens a static how-to image explaining the game to new visitors.
- **Trophy** (`clickType: link` → drawer): opens the two-tab Leaderboard + Badges surface.
- **Finished-monster assets** (dropped by the app at completion, `clickType: link` → drawer): opens the Single Monster View for that monster, with Download PNG and (for admins) a Delete confirm.

### Main modal — Create tab

- **Create New Monster** tile (top-left) — server picks the caller's section at random.
- **Resume** tile — surfaces when the caller has an unfinished section (soft lock, 30-min TTL).
- **In-progress card grid** — one card per unfinished monster with three horizontal section slots. Each slot renders one of `Available` (Join), `Locked-by-you` (Resume), `Locked-by-others` (contributor pill), `Done` (peer art visible after you submit — spec §Reveal rule).
- **Admin trash** per card with the "Delete this monster in progress?" confirm modal.
- Ordering: Create-New → Resume → your draft → cards you've contributed to → cards with available sections → the rest, each bucket newest-first.

### Main modal — Gallery tab

- Card grid of finished monsters with an award ribbon (`{PLACE} · {CATEGORY} · {DATE}`), composited art, contributors dot-separated, `Born {date}`, per-card Download PNG.
- Green outline on cards you contributed to.
- Filters: Sort (Newest / Oldest), "Show only my monsters" (reads from visitor.contributedMonsters — includes monsters that have rotated out of the 200-cap roster), "Show only award winners".

### Main modal — Vote tab (three states)

- **Running**: amber countdown pill formatted `Xd : Yh : Zm`, "LAST WEEK'S WINNERS · {CATEGORY}" row (hidden if none), category question ("Which one is the …?"), two side-by-side matchup cards + VS chip. Vote cap = `2 × pool.size` per cycle per visitor.
- **Scheduled**: "No vote is running right now" with the next scheduled Sunday date.
- **Not-enough-monsters**: `X of the 10 monsters needed are in the pool`.
- **Voting-off** (admin toggled): "Check in with your teacher about the next vote!"

### Monster Builder drawer

- Three-section layout with a pinned live preview (dashed peer placeholders + your section rendering live per `LAYER_ORDER`).
- Category accordions with `X of Y chosen` progress, `chosen ✓` / `Required` chips, and a dashed-red `NONE` tile where "nothing" is a valid look.
- 30-name dropdown per section (head → first name, torso → last name, legs → title). The three tokens compose the monster's storable name at completion.
- **Legs sub-rule**: picking a `legs.legs` part with `supportsFeet: false` while feet is chosen fires the icon-buttoned incompatibility modal.
- **Submit** confirm modal ("Submit this Monster Head?") + Cancel & release my claim.

### Single Monster View drawer

- Composited PNG, name, contributor attribution, Born date, Award ribbon when awarded, Download PNG (opens in new tab), Back to Monster Mash.
- Admin variant adds a trash icon + delete confirm (spec: "It will be removed from the gallery and the world. If it's in this week's vote, it will be disqualified. Deletion is permanent: cleared from the key asset AND from all three user records.")

### Trophy drawer

- **Leaderboard tab**: single sorted list (awards desc → monsters-built desc), top 25, caller's row highlighted yellow and rendered outside the top-25 when needed. Admin footer: `Reset Leaderboard` (badges are NOT affected).
- **Badges tab**: `Your Badges · X of 38`, grouped `For building` / `For voting` / `For visiting` / `For winning`. Earned = gold circle; locked = padlock.

### Banners (spec priority order)

1. **Green winner banner** — "Your monster placed {1st|2nd|3rd} in {Category}…"
2. **Blue completion banner** — "Your section finished the monster!"
3. **Amber countdown banner** — "{X days and Y hours} left to VOTE on last week's monsters!"
4. **Blue advisory** — "Next week's voting category: {Category} — FINISH your monsters by Sat 11:59 PM ET…"

Both green + blue banners POST `/banners/acknowledge` on first view to clear the queue (spec: "shown until first viewed, then cleared").

### Admin features

- Delete in-progress monster from the Create tab.
- Delete completed monster from the Single Monster View (also removes the world drop + strips it from the current vote cycle pool + tallies).
- Reset Leaderboard from the Trophy drawer.
- Weekly voting on/off toggle (Admin Settings — Epic 8's minor placeholder for now).

## Required Assets with Unique Names

| Purpose | Unique name pattern | How it's placed |
| --- | --- | --- |
| **Monster Mash key asset** | `MonsterMash-keyAsset` (or the click target the developer configures) | World builder places manually with `clickType: link` pointing at the app URL |
| **Info sign** | `MonsterMash-infoSign` | World builder places manually with `?screen=how-to` (drawer clickType) |
| **Trophy asset** | `MonsterMash-trophy` | World builder places manually with `?screen=trophy` (drawer clickType) |
| **Finished-monster asset** | `MonsterMash-monster-{monsterId}` | **App drops automatically at completion** via `DroppedAsset.drop`. Do not place manually. |

All app-owned dropped assets share the key asset's `sceneDropId` — scene-wide fetches work.

## Technical Architecture (Data Objects)

Per-instance state lives on three dataObject surfaces plus the ecosystem inventory. All caps are per instance.

### Key asset dataObject (`KeyAssetDataObject`)

The "hub". Roster of every monster (in-progress + complete, index-only for finished), current submission window, current vote cycle, stored winners (rolling last 30), admin settings, category rotation schedule, and the trophy leaderboard cache.

- `weeklyVotingEnabled: boolean` — admin toggle.
- `howToImageUrl?: string | null` — override for the Info-sign image.
- `monsters: { [monsterId]: MonsterIndexEntry }` — capped at 100 in-progress + 200 finished; eldest by `lastEditedAt` evicted first.
- `currentSubmissionWindow: SubmissionWindow` — Sun→Sat ET containing "now", `eligibleMonsterIds` appended by completions.
- `currentVoteCycle: VoteCycle | null` — pool + tallies + total matchups served; opened on Sunday if previous week's `eligibleMonsterIds` ≥ 10.
- `storedWinners: StoredWinner[]` — rolling 30 (10 weeks × 3 places). Deleted monsters keep their spot with a snapshot.
- `trophyLeaderboard: { [profileId]: { displayName, awardsWon, monstersContributedTo, lastActivityAt } }` — cache; rebuilt when winners are crowned.
- `categorySchedule: { orderIds: string[], nextIndex: number }` — rotation across the 10 voting categories.

### Per-monster dropped asset dataObject (`MonsterAssetDataObject`)

One per finished monster (dropped in the world at completion, mirrors Build-an-Asset). Full record — name, birthdate, image URL, three contributor profiles + display names, per-section records (parts + name tokens + per-section image URLs), optional `latestAward`.

### Visitor / User dataObject (`MonsterMashVisitorData`)

Per profile per instance, scoped under `${urlSlug}-${sceneDropId}`. Includes:

- `contributedMonsters` — monsterId → { section, submittedAt, completedAt, awards, and post-finalize enrichment (monsterAssetId, name, imageUrl, birthdate, contributor names). Persists across roster eviction so "Show only my monsters" surfaces evicted own-monsters.
- `activeDraft` — the caller's live section lock (max one at a time).
- `pendingWinBanners` / `pendingCompletionBanners` — queues drained on first view via `POST /banners/acknowledge`.
- `votesCastThisWeek`, `totalVotesCast`, `weeksVotedIn`, `weeksSubmittedIn`, `weeksCreatedMonsterIn`, `daysAppOpened` — analytics + badge counters.

## API Endpoints

### Main app + banners

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/main-app` | Modal payload (roster, window, cycle, banners, activeDraft). Runs opportunistic weekly rollover + stale-lock expiry. |
| POST | `/api/banners/acknowledge` | Clears pending win + completion queues for caller. |

### Monsters lifecycle

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/monsters/start` | Allocates monsterId, picks a random section, locks it for caller. Enforces IN_PROGRESS_CAP + refuses when caller already has an activeDraft. |
| POST | `/api/monsters/:id/claim` | Join an available section. 409 on race. |
| POST | `/api/monsters/:id/section` | Submit a section. Composes + uploads per-section PNG; on third-section landing, runs `finalizeMonster` (full-monster compose + world drop + roster migration + banner + leaderboard fanout). |
| POST | `/api/monsters/:id/abandon` | Release the caller's claim (idempotent). |
| DELETE | `/api/monsters/:id` | Admin-only. Removes from roster, cleans window/cycle references; for complete monsters, deletes the world drop and clears each contributor's `contributedMonsters` entry. |

### Gallery + single monster

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/gallery` | `?mine=true` includes evicted own-monsters; `?winners=true` filters to awarded; `?sort=newest|oldest`. |
| GET | `/api/monsters/:id` | Single Monster View payload; falls back to visitor.contributedMonsters when the monster is evicted. |

### Vote

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/vote` | Vote-tab payload (state / countdown / matchup / last winners / caller vote-cap). |
| POST | `/api/vote/cast` | Body: `{ winnerMonsterId, loserMonsterId }`. Increments tallies, bumps caller's `votesCastThisWeek`, returns the next matchup. |

### Trophy

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/trophy` | Leaderboard (top 25 + caller's row) + badges grid (four groups × 38). |
| POST | `/api/leaderboard/reset` | Admin-only. Wipes the trophy leaderboard cache (badges unaffected). |

## Environment Variables

Copy `.env-example` → `.env` at the repo root:

```
INSTANCE_DOMAIN=api.topia.io
INTERACTIVE_KEY=your_interactive_key
INTERACTIVE_SECRET=your_interactive_secret
NODE_ENV=development
# Where the client + server fetch part PNGs from. Empty in dev → served from `client/public/parts/`.
PARTS_BASE_URL=
# Bucket for composed monster PNGs. Local dev: `topia-dev-test`.
S3_BUCKET=topia-dev-test
```

## Getting Started

```bash
npm install
npm run dev
```

- Server runs on `:3000` (Express) and serves the compiled client in production.
- Client runs on `:5173` (Vite) in dev.
- Point the Monster Mash key asset in your world at `http://localhost:3001` (dev) — the app reads interactive params from the query string.

Once opened in a world with valid interactive params, the app initializes both the key asset dataObject and the caller's per-instance visitor dataObject on the first `/api/main-app` call.

## For Developers

- **Content** (`shared/content/monsterMash.ts`) — categories, parts (with `supportsFeet` on legs), name tokens (30 per section), `LAYER_ORDER` (locked back → front), and the voting-category rotation. When Bekama delivers art, either drop PNGs into `client/public/parts/{section}/{category}/{imageName}` or set `PARTS_BASE_URL` to point at an S3 bucket with the same layout.
- **Badges** (`shared/content/badges.ts`) — 38 badges tagged with their group + threshold. `evaluateBadges` (server/utils/badges/) returns badges to grant given the target's counters + owned set.
- **Timezone** — hardcoded `America/New_York`. Every window and cycle rolls at Sun 00:00 ET → Sat 23:59:59 ET via `server/utils/vote/computeWindows.ts` (DST-safe two-pass convergence).
- **Testing** — `npm test --workspace=server` runs the Jest suite (`server/tests/routes.test.ts`) covering every route. Add coverage under `server/tests/` for new routes. Ecosystem writes are mocked in `server/mocks/@rtsdk/topia.ts`.
- **Compositor** — Jimp; per-section PNG at `monster-mash/sections/{monsterId}-{section}.png`, full monster at `monster-mash/monsters/{monsterId}.png`. Uploads via `@aws-sdk/client-s3` to bucket in `S3_BUCKET`.

## Plan + Spec

- Design spec: `~/Downloads/Monster Mash Design Spec 1.2.md`
- Implementation plan (per-epic): [`plan.md`](./plan.md)
