# Monster Mash — Implementation Plan

Design spec: `~/Downloads/Monster Mash Design Spec 1.2.md` (v1.2, 2026-09-17).
Read `.ai/rules.md` before implementation. Strike-through content in the spec is out of scope for v1.

## 1. Project Overview

Monster Mash is a collaborative "exquisite corpse" creature builder. Three players each build one section of a monster — head, torso, legs — from pre-authored parts. When the third section lands, the monster composites into a single PNG, drops into the world as its own dropped asset, joins the class gallery, and enters next week's vote. Weekly rotating vote categories crown 1st/2nd/3rd place; every contributor on a winning monster earns a badge. A Trophy asset opens a leaderboards-and-badges drawer.

### App surfaces

| Surface                 | Container                                                        | Trigger                                        |
| ----------------------- | ---------------------------------------------------------------- | ---------------------------------------------- |
| **Main App**            | **Modal** — takes most of the browser window, must be responsive | Click the Monster Mash key asset               |
| **How-to image**        | **Drawer** — fixed width (image-only page)                       | Click the in-world **Info sign** asset         |
| **Monster Builder**     | **Drawer** — fixed width                                         | Create-new / Join / Resume from the Create tab |
| **Single Monster View** | **Drawer** — fixed width                                         | Click any monster dropped in the world         |
| **Trophy**              | **Drawer** — fixed width                                         | Click the Trophy asset                         |

The modal is the only responsive surface — everything else is Topia's standard fixed-width drawer. The world therefore hosts **three** app-owned clickables in addition to the finished-monster assets: the **Monster Mash key asset**, an **Info sign** (opens a static how-to image in a drawer), and the **Trophy** (leaderboards + badges).

## 2. Core User Flow

1. Player clicks the Monster Mash **key asset** in the world. The main app modal opens.
2. Banners (win, monster-completed-by-others, vote/submission window reminders) surface at the top of every tab on the first open after a change.
3. On the **Create** tab, the player either taps _Create New Monster_ (server randomly assigns them a section) or hits _Join_ on an available section of an in-progress monster. The **Monster Builder** drawer opens.
4. In the drawer, the player builds their section — one selection per required category, one name-token pick. **Submit** confirms and locks the section forever.
5. When the third section is submitted, the server composites the layered PNG, uploads to S3, drops the monster into the world as a new dropped asset, adds it to the Gallery + current submission window, and enqueues completion banners for the two other contributors.
6. Weekly submission/voting windows tick over on the first main-app open after 12:00 AM ET Sunday. The **Vote** tab serves head-to-head matchups from the previous week's pool; winners are crowned when the cycle closes.
7. Contributors on a winning monster receive an ecosystem badge, a toast, and a pinned green banner on next-open.
8. Clicking the **Trophy** asset opens a Leaderboards + Badges drawer scoped to this instance.

## 3. Terminology

- **Instance** — one placement of the Monster Mash scene (all its dropped assets share a `sceneDropId`). Every count and every leaderboard is scoped per instance.
- **Monster** — a composite creature. Three sections + one composited image + one composed name.
- **Section** — `head` | `torso` | `legs`. Owned by exactly one contributor once submitted.
- **Section claim** — a soft lock. Reverts to `available` after 30 min of inactivity.
- **Submission window** — the Sun 00:00 → Sat 23:59 ET week during which monsters can be completed and enter the following week's vote.
- **Vote cycle** — the Sun→Sat week during which the previous window's monsters get voted on.
- **Matchup** — a single pair of monsters shown side-by-side under this cycle's question.
- **Category** — this cycle's voting question ("Silliest", "Best Dressed", …).
- **Contributor** — a `profileId` that owns a section of a specific monster.
- **Storable name** — the composed monster name once section #3 lands (e.g. _Harold McFishy the Magnificent_).
- **Name token** — first name (head) | last name (torso) | title (legs). Each is one of ~30 authored options.

## 4. Technical Requirements

### 4.1 Style + responsiveness

- Follow `.ai/style-guide.md` (SDK CSS classes first, Tailwind only when no SDK class fits, no inline styles except dynamic positioning).
- **Main App modal**: fluid width up to browser bounds. Card grids must reflow (`grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))` or similar) so the same layout works from a narrow window to a wide one.
- **Drawer surfaces** (Monster Builder, Single Monster View, Trophy) render at Topia's fixed drawer width; no responsive concerns beyond the standard breakpoints already handled by `PageContainer`.
- Accessibility: `.ai/accessibility.md` (semantic elements, focus rings, labelled buttons, prefers-reduced-motion on the "It's Alive!" celebration).

### 4.2 Storage layout

Three data-object surfaces plus the ecosystem badge catalog. All app dropped assets share the key asset's `sceneDropId`, so scene-wide fetches work.

- **Key asset dataObject** — the "hub". Roster of every monster (index only), vote-cycle state, submission-window state, admin settings, stored-winners memory. Kept small.
- **Per-monster dropped asset dataObject** — one per finished monster (dropped in the world at completion, mirrors Build-an-Asset). Full monster state (parts, contributors, image URL, awards) lives here. **In-progress monsters do NOT get a dropped asset yet** — their submitted-section records live under `keyAsset.monsters[id]` until the third section lands and we drop the asset.
- **Trophy dropped asset dataObject** — leaderboard cache (per-profile award count + monsters-contributed-to).
- **Visitor/User dataObject** (per profile per instance; Visitor for self, User class for foreign-profile writes — same underlying record) — that profile's contribution registry, pending banner queue, in-progress draft, per-badge counters.

Cross-world state: none. All stats reset per instance.

### 4.3 Timezone

Hardcoded `America/New_York` for every window computation. No admin override.

### 4.4 Content storage

Static TypeScript content, mirroring `sdk-build-an-asset/client/src/constants.ts`:

- Parts + name-tokens live in `shared/content/monsterMash.ts` (accessible to both client and server for the compositor).
- Each part carries `{ id, section, category, imageName, supportsFeet? }` (leg-only flag). No color variations.
- Voting categories live in the same file: an ordered array with the launch-order sequence from spec §Voting Categories.
- Badge catalog referenced by name string; actual badge images/descriptions come from the ecosystem inventory.

Placeholder art strategy: `client/public/parts/` folder in the repo with a README documenting the expected `{section}/{category}/{partId}.png` structure and same-dimensions requirement. Once art is delivered, the folder gets swapped in place (or uploaded to `topia-dev-test.s3.amazonaws.com/monster-mash/parts/…` for production; local dev references S3 URLs OR the `client/public/parts/` folder via a `PARTS_BASE_URL` env var so the flip is one line).

### 4.5 Image composition

Reuse `sdk-build-an-asset/server/utils/images/generateS3URL.ts` verbatim in shape:

- **Jimp** for compositing (no node-canvas, no new Docker deps).
- Reads each part image from S3 by URL, layers per `LAYER_ORDER`, `getBufferAsync(Jimp.MIME_PNG)`, uploads back to S3.
- Path: `monster-mash/userUploads/{monsterId}.png`.
- Bucket: `S3_BUCKET` env var. Local dev uses `topia-dev-test` (per user note); production gets its own bucket when created.
- Composition fires exactly once per monster — when section #3 submits.

**Layer order** (locked, back → front, per spec §Parts Spec):

```
LAYER_ORDER = [
  "legs.back",       // tail, wheelchair — behind everything
  "torso.back",      // bat wings, jetpack
  "legs.legs",           // legs base
  "torso.arms",          // arms incl. hands
  "torso.shirt",         // torso
  "torso.sleeves",       // over arms
  "legs.feet",           // on top of legs
  "legs.waist",          // over legs
  "head.head",           // head shape (incl. ears)
  "head.eyes",
  "head.mouth",
  "head.nose",
  "head.hair",           // on top
]
```

The client-side preview uses the same order to stack `<img>` layers via z-index — spec's requirement that the drawer preview matches the final image.

### 4.6 Data models

```typescript
// ─────────────── KEY ASSET dataObject ───────────────

interface KeyAssetDataObject {
  schemaVersion: 1;
  timezone: "America/New_York"; // hardcoded per spec §Submission/voting windows

  // Admin settings
  weeklyVotingEnabled: boolean;
  // Optional override for the Info-sign asset image. Falls back to the bundled
  // asset when null.
  howToImageUrl?: string | null;

  // Every monster (in-progress + complete), indexed by id.
  // For finished monsters, full state lives on the monster's own dropped asset;
  // this map holds just what the Create/Gallery tabs need to render a card
  // without fetching per-monster.
  monsters: {
    [monsterId: string]: MonsterIndexEntry;
  };

  currentSubmissionWindow: SubmissionWindow;
  currentVoteCycle: VoteCycle | null; // null when weekly voting is off or before the first vote

  // Rolling 30 (10 weeks × 3 places). Monsters in this list are ineligible for a new vote.
  storedWinners: StoredWinner[];

  // Category rotation
  categorySchedule: {
    orderIds: string[]; // ["most-likely-eat-homework", "silliest", ...]
    nextIndex: number;
  };

  // Cached for pool-sizing heuristic on the following cycle
  lastCycleTotalVotes?: number;
}

interface MonsterIndexEntry {
  monsterId: string;
  monsterAssetId?: string; // dropped-asset id in the world (set on completion)
  state: "in-progress" | "complete";
  createdAt: number; // when first section was submitted
  lastEditedAt: number; // for eldest-first eviction when cap exceeded
  birthdate?: number; // set on completion
  name?: string; // composed on completion
  imageUrl?: string; // S3 composed PNG (also on the monster asset itself)
  sections: {
    head: SectionRosterEntry;
    torso: SectionRosterEntry;
    legs: SectionRosterEntry;
  };
  contributorProfileIds: string[]; // one per submitted section; ≤3
  // Denormalized for the Gallery ribbon
  latestAward?: {
    category: string;
    place: 1 | 2 | 3;
    awardedAt: number;
  };
  // In-progress-only: the section records themselves live here until completion,
  // when we migrate them onto the newly-dropped monster asset.
  inProgressSections?: Partial<{
    head: SectionRecord;
    torso: SectionRecord;
    legs: SectionRecord;
  }>;
}

interface SectionRosterEntry {
  status: "available" | "locked" | "done";
  contributorProfileId?: string;
  contributorDisplayName?: string;
  lockedAt?: number;
  submittedAt?: number;
}

interface SubmissionWindow {
  windowId: string; // "2026-W40" (ISO week in ET)
  startAt: number; // Sun 00:00:00 ET epoch ms
  endAt: number; // Sat 23:59:59 ET epoch ms
  eligibleMonsterIds: string[]; // append when a monster completes within this window
}

interface VoteCycle {
  cycleId: string; // "2026-W40-vote"
  category: string; // "silliest"
  startAt: number;
  endAt: number;
  poolMonsterIds: string[]; // frozen when the cycle opened
  tallies: {
    [monsterId: string]: { shown: number; wins: number };
  };
  totalMatchupsServed: number;
  computedWinners?: Array<{ monsterId: string; place: 1 | 2 | 3 }>;
}

interface StoredWinner {
  monsterId: string;
  category: string;
  place: 1 | 2 | 3;
  awardedAt: number;
  contributorProfileIds: string[];
  // Frozen so the Vote-tab winners row still renders "[Monster Deleted]" (spec §Admin) with basic context.
  snapshotName?: string;
  snapshotImageUrl?: string;
}

// ─────────────── PER-MONSTER DROPPED ASSET dataObject ───────────────

interface MonsterAssetDataObject {
  schemaVersion: 1;
  monsterId: string;
  name: string;
  birthdate: number;
  imageUrl: string;
  contributorProfileIds: [string, string, string]; // [head, torso, legs]
  contributorDisplayNames: [string, string, string];
  sections: {
    head: SectionRecord;
    torso: SectionRecord;
    legs: SectionRecord;
  };
  // Denormalized ribbon for the Single Monster View drawer
  latestAward?: { category: string; place: 1 | 2 | 3; awardedAt: number };
}

interface SectionRecord {
  contributorProfileId: string;
  contributorDisplayName: string;
  submittedAt: number;
  parts: {
    // maps to LAYER_ORDER slots for this section
    [categoryId: string]: string; // e.g. { headShape: "jack-o-lantern", eyes: "googly", ... }
  };
  nameToken: string; // first name / last name / title
  // Per-section composed PNG uploaded at submit time. Needed so the Create-tab
  // card + Builder preview can render the real art to a contributor who has
  // already submitted their own section, before the monster is finished
  // (spec §Reveal rule; mockups image11 / image14 / image15).
  sectionImageUrl?: string;
}

// ─────────────── TROPHY DROPPED ASSET dataObject ───────────────

interface TrophyDataObject {
  schemaVersion: 1;
  leaderboard: {
    [profileId: string]: {
      displayName: string;
      awardsWon: number;
      monstersContributedTo: number; // secondary sort / tiebreaker
      lastActivityAt: number;
    };
  };
}

// ─────────────── VISITOR dataObject (also accessible via User class) ───────────────

interface VisitorDataObject {
  schemaVersion: 1;

  // Every monster this profile has contributed a section to (this instance).
  // Enables "show only my monsters" + banner enqueue without scanning the roster.
  contributedMonsters: {
    [monsterId: string]: {
      section: "head" | "torso" | "legs";
      submittedAt: number;
      completedAt?: number; // set when the third section lands
      awards?: Array<{ category: string; place: 1 | 2 | 3; awardedAt: number }>;
    };
  };

  // Section the caller currently has locked (max one at a time).
  activeDraft?: {
    monsterId: string;
    section: "head" | "torso" | "legs";
    lockedAt: number;
    lastActivityAt: number;
    picks: { [categoryId: string]: string };
    nameToken?: string;
  };

  // Banner queues. Consumer clears on first open-and-see; only the most recent of each
  // type ever renders (per spec) — the rest sit in the queue for analytics.
  pendingWinBanners: Array<{
    monsterId: string;
    category: string;
    place: 1 | 2 | 3;
    awardedAt: number;
  }>;
  pendingCompletionBanners: Array<{
    monsterId: string;
    monsterName: string;
    completedAt: number;
  }>;

  // Badge/analytics counters (per instance)
  daysAppOpened: string[]; // ISO dates
  weeksVotedIn: string[]; // "2026-W40"
  weeksSubmittedIn: string[];
  weeksCreatedMonsterIn: string[];
  votesCastThisWeek: { windowId: string; count: number };
  totalVotesCast: number;
  totalThirdSectionCompletions: number;
}
```

### 4.7 Section-claim lock behaviour

- On claim: server checks `keyAsset.monsters[id].sections[section].status`. If `available`, flip to `locked`, stamp `lockedAt = now`, write the same `activeDraft` on the caller's visitor dataObject.
- Any progress in the drawer updates `activeDraft.lastActivityAt` (client-driven, throttled).
- **Resume** button in the Create-tab card: only rendered when `visitor.activeDraft.monsterId === monsterId && section === thisSection && (now - lastActivityAt) < 30min`.
- Expiry: when a controller reads the key asset and finds a `locked` section whose `lockedAt` (fall back to `submittedAt`) is >30min ago, it reverts to `available` and clears the caller's `activeDraft` if it matches. No cron — expiry is opportunistic, checked on read.

### 4.8 Composed name

On completion: `name = [head.nameToken, torso.nameToken, legs.nameToken].join(" ")` → _Harold McFishy the Magnificent_. Stored on both the key-asset index and the monster's own dataObject.

## 5. User Stories & Acceptance Criteria (by Epic)

Full acceptance criteria will get spelled out per epic during implementation. High-level structure:

### Epic 1 — Foundations & boilerplate cleanup

Scaffolding, content file, initialize hooks for key asset + trophy, boilerplate audit per `.ai/templates/plan.md` §9a. Ends with an empty main-app modal that lists nothing.

### Epic 2 — Monster Builder drawer

Drawer UI, accordion + card grid + stacked preview (port from `sdk-build-an-asset/client/src/pages/EditAsset.tsx`, minus the ItemVariationSelectorModal), name-token picker, submit-with-confirm, section-claim lock. Ends with a single monster completable end-to-end but not yet placed.

### Epic 3 — Assembly + world drop

Server-side Jimp composition (port `sdk-build-an-asset/server/utils/images/generateS3URL.ts`), "It's Alive!" reveal card in the drawer, `DroppedAsset.drop` in the world with `clickType: "link"` + `clickableLink` back to `?screen=single-monster&monsterId=…`, key-asset roster migration from in-progress → complete.

### Epic 4 — Create tab

Card grid with three-section state visualization; Create-New card always first; own in-progress cards sorted next; Available/Locked/Done rendering with Join/Resume/greyed states; 100-card cap with eldest-first eviction; admin trash icon + confirm.

### Epic 5 — Gallery tab

Card grid of finished monsters, sort-by-date, filter-by-mine, filter-by-winners, ribbon for latestAward, download-in-new-tab, 200-card cap + your-own-monsters exempted from eviction. Single Monster View drawer opens from world clicks.

### Epic 6 — Vote cycle

Window computation (ET Sun→Sat aligned), pool builder + carry-over algorithm (per spec §Voting pool + external algorithm doc), matchup pairing (closest-record heuristic), vote-cast endpoint, session vote-cap UI. Empty state when the pool is under 10.

### Epic 7 — Awards + banners

Winner computation on cycle close, badge grants via ecosystem `grantInventoryItem`, banner queue writes to each contributor's dataObject (Visitor for self, User class for the other two), green-banner + toast on first-open, blue-completion-banner + toast on first-open. Trophy leaderboard cache updated.

### Epic 8 — Trophy drawer

Leaderboard + Badges tabs, admin leaderboard reset button + confirm, your-own-row shown even below top-25.

### Epic 9 — Analytics

Emit every event from spec §Analytics Requirements with all properties (`profileId`, `urlSlug`, `uniqueKey`, plus event-specific fields). Emission is via `updateDataObject`'s `analytics` option, matching the existing pattern in this monorepo.

### Epic 10 — Finalization

README rewrite, `server/tests/routes.test.ts` covering every route, boilerplate cleanup per `.ai/templates/plan.md` §9. Commit → push → PR into main.

## 6. Implementation Plan

### 6.1 Server components

```
server/
├── controllers/
│   ├── handleGetMainApp.ts           # everything the modal needs (roster, cycle, banners)
│   ├── handleGetGallery.ts           # paginated finished + filters
│   ├── handleGetVote.ts              # cycle state + next matchup (session-cap aware)
│   ├── handleStartMonster.ts         # POST /monsters/start → assigns random section
│   ├── handleClaimSection.ts         # POST /monsters/:id/claim (soft lock)
│   ├── handleSubmitSection.ts        # POST /monsters/:id/section (finalizes)
│   ├── handleAbandonSection.ts       # POST /monsters/:id/abandon (releases lock)
│   ├── handleCastVote.ts             # POST /vote/cast
│   ├── handleDeleteMonster.ts        # DELETE /monsters/:id (admin)
│   ├── handleUpdateAdminSettings.ts  # PUT /admin/settings (weeklyVotingEnabled)
│   ├── handleResetLeaderboard.ts     # POST /leaderboard/reset (admin)
│   ├── handleAcknowledgeBanners.ts   # POST /banners/acknowledge
│   ├── handleGetMonster.ts           # GET /monsters/:id (single monster view)
│   └── handleGetTrophy.ts            # GET /trophy
├── utils/
│   ├── images/
│   │   └── composeMonsterImage.ts    # Jimp composition + S3 upload (port from Build-an-Asset)
│   ├── monsters/
│   │   ├── initializeKeyAsset.ts     # ensures schema/defaults on first open
│   │   ├── evictOldestInProgress.ts  # keeps ≤100 in-progress
│   │   ├── evictOldestFinished.ts    # keeps ≤200 finished (exempts contributor's own)
│   │   ├── expireStaleLocks.ts       # opportunistic 30-min lock expiry
│   │   ├── composeMonsterName.ts     # joins the three name tokens
│   │   └── dropMonsterAsset.ts       # DroppedAsset.drop wrapper
│   ├── vote/
│   │   ├── computeWindows.ts         # ET Sun→Sat math
│   │   ├── openNextCycle.ts          # closes previous + opens new
│   │   ├── buildPool.ts              # per spec's pool + carry-over algorithm
│   │   ├── pickMatchup.ts            # closest-record pairing
│   │   ├── computeWinners.ts         # win rate = (wins + 1) / (shown + 2), ties → most votes → earliest birthdate
│   │   └── enqueueWinBanners.ts      # fans out to contributor Visitors via User class
│   ├── banners/
│   │   └── enqueueCompletionBanners.ts   # fans out on section-3 submit
│   ├── trophy/
│   │   └── updateLeaderboard.ts
│   └── content/
│       └── validatePicks.ts          # server-side re-validation of every submitted section
└── types/
    ├── KeyAssetDataObject.ts
    ├── MonsterAssetDataObject.ts
    ├── TrophyDataObject.ts
    ├── VisitorDataObject.ts
    └── SharedTypes.ts                # Section, VoteCycle, StoredWinner, etc.
```

### 6.2 Client components

```
client/src/
├── pages/
│   ├── Home.tsx                      # entry — routes to modal or drawer based on ?screen
│   ├── MainApp.tsx                   # the responsive modal (Create/Gallery/Vote tabs)
│   ├── MonsterBuilder.tsx            # the drawer builder for one section
│   ├── SingleMonsterView.tsx         # drawer for a clicked world monster
│   └── Trophy.tsx                    # drawer for the leaderboard + badges
├── components/
│   ├── MainApp/
│   │   ├── BannerStack.tsx           # win + completion + window-countdown banners
│   │   ├── TabBar.tsx
│   │   ├── CreateTab/
│   │   │   ├── CreateTab.tsx
│   │   │   ├── CreateNewCard.tsx
│   │   │   ├── MonsterCard.tsx       # in-progress card with three-section state
│   │   │   └── SectionSlot.tsx       # available / locked / done rendering
│   │   ├── GalleryTab/
│   │   │   ├── GalleryTab.tsx
│   │   │   ├── GalleryFilters.tsx
│   │   │   └── MonsterCardComplete.tsx
│   │   └── VoteTab/
│   │       ├── VoteTab.tsx
│   │       ├── LastWeeksWinners.tsx
│   │       ├── Matchup.tsx
│   │       └── VoteEmpty.tsx         # "no vote", "not enough monsters", "hit your cap"
│   ├── Builder/
│   │   ├── SectionAccordion.tsx      # category accordion with ✓/x header state
│   │   ├── PartGrid.tsx              # card-grid picker (matches Build-an-Asset)
│   │   ├── NameTokenPicker.tsx
│   │   ├── LayeredPreview.tsx        # stacked <img> preview at the top of the drawer
│   │   └── SubmitConfirm.tsx
│   ├── SingleMonster/
│   │   └── MonsterDetails.tsx
│   ├── Trophy/
│   │   ├── LeaderboardTab.tsx
│   │   └── BadgesTab.tsx
│   └── shared/
│       ├── AwardRibbon.tsx
│       ├── DownloadArrow.tsx         # opens the composed image in a new tab
│       ├── ContributorList.tsx
│       └── AdminTrashIcon.tsx
├── content/
│   └── monsterMash.ts                # re-export of shared/content/monsterMash.ts (parts, categories, names, layer order)
├── context/                          # standard GlobalContext pattern
└── utils/
    ├── formatWeekWindow.ts           # "3d 4h 22m left to vote…"
    ├── getSectionPreview.ts          # builds an ordered <img> array from picks
    └── ...
```

### 6.3 API endpoints

```typescript
// ─── Main app ───
GET  /api/main-app                       // roster + cycle + banners (used by MainApp modal)

// ─── Create ───
POST /api/monsters/start                 // Returns { monsterId, section (random) }
POST /api/monsters/:id/claim             // Body: { section }. Returns 409 if not available.
POST /api/monsters/:id/section           // Body: { section, picks: {...}, nameToken }.
                                         //   Runs image composition + world drop when it's #3.
POST /api/monsters/:id/abandon           // Manual cancel; releases lock, clears activeDraft.

// ─── Gallery / single monster ───
GET  /api/gallery                        // Query: page, filter=mine|winners, sort=newest|oldest
GET  /api/monsters/:id                   // Single Monster View drawer payload

// ─── Vote ───
GET  /api/vote                           // Cycle + next matchup for this session
POST /api/vote/cast                      // Body: { monsterId (winner), matchupId }

// ─── Admin ───
DELETE /api/monsters/:id                 // Admin only
PUT    /api/admin/settings               // Body: { weeklyVotingEnabled }
POST   /api/leaderboard/reset            // Admin only

// ─── Trophy ───
GET  /api/trophy                         // Leaderboard + earned/locked badges for caller

// ─── Utilities ───
POST /api/banners/acknowledge            // Clears pending banner queues for caller
```

Every response follows `{ success: true, data?: any }` on success and `{ success: false, message: string }` on failure per `.ai/rules.md`.

### 6.4 State management

Standard `GlobalContext` per the boilerplate:

```typescript
interface InitialState {
  hasSetupBackend: boolean;
  hasInteractiveParams: boolean;
  visitor?: { isAdmin: boolean; profileId: string; displayName: string };
  isAdmin?: boolean;

  // Main-app snapshot
  monsters?: MonsterIndexEntry[]; // roster
  currentVoteCycle?: VoteCycle | null;
  currentSubmissionWindow?: SubmissionWindow;
  storedWinners?: StoredWinner[];
  banners?: {
    win?: { monsterId; category; place; awardedAt };
    completion?: { monsterId; monsterName; completedAt };
    windowCountdown?: string; // pre-formatted
    nextCategoryReminder?: string;
  };

  // Local UI state
  activeTab: "create" | "gallery" | "vote";
  activeDraft?: VisitorDataObject["activeDraft"];
  matchup?: { pair: [MonsterIndexEntry, MonsterIndexEntry]; matchupId: string };

  error?: string;
}
```

Client re-fetches (pessimistic) rather than SSE — per user answer to Q8. Claim-race UI: on 409 from `POST /monsters/:id/claim`, dispatch a re-fetch of `/api/main-app` and surface `"Oops, that one was just claimed. Please choose another!"` toast.

## 7. Testing Approach

- Jest, following the existing pattern in this monorepo (`server/tests/routes.test.ts`), with `server/mocks/@rtsdk/topia.ts` extended for the SDK factories used (World, DroppedAsset, Visitor, User, Asset).
- Test bands:
  - **Route contract**: every route → success + validation errors + auth checks (admin routes reject non-admin).
  - **Section-claim races**: parallel claim attempts on the same section → one 200, one 409, lock reverts on 30-min timer expiry.
  - **Composition**: `composeMonsterImage` given three section records produces a merged buffer of expected dimensions; layer order matches spec.
  - **Windows/vote**: window boundaries computed in ET regardless of server clock TZ; pool builder honours carry-over rules; winners computed by win-rate with correct tiebreakers.
  - **Fanout writes**: banner enqueue writes to three distinct visitor dataObjects (via User class for the two non-caller contributors).
  - **Caps + eviction**: 101st in-progress monster evicts the eldest by `lastEditedAt`; 201st finished evicts the eldest non-contributor's finished monster.

## 8. Validation Checklist

Before shipping:

- [ ] All 10 epics land per acceptance criteria
- [ ] Main App renders correctly at narrow (drawer-width) and wide (full-viewport) sizes
- [ ] Every drawer surface uses `PageContainer` unchanged
- [ ] SDK CSS classes for all buttons/typography/inputs; Tailwind only for layout/spacing where SDK has no equivalent
- [ ] Every controller wraps SDK calls in try/catch; every response matches the response schema
- [ ] All API endpoints match the shape in §6.3
- [ ] Every analytic event from spec §Analytics Requirements emits with every listed property (name is the only customizable field)
- [ ] Section-claim lock expires after 30 min of inactivity, opportunistically, no cron
- [ ] Composed name persists on both key-asset roster and monster-asset dataObject
- [ ] Windows always align to Sun 00:00 ET → Sat 23:59 ET regardless of server clock
- [ ] `Visitor` for self-writes, `User` only for foreign-profile fanout
- [ ] Trophy + monster dropped assets carry the same `sceneDropId` as the key asset
- [ ] Placeholder parts folder documented with expected `{section}/{category}/{partId}.png` shape
- [ ] `README.md` rewritten (spec §9b)
- [ ] `server/tests/routes.test.ts` covers every route
- [ ] Boilerplate cleanup per `.ai/templates/plan.md` §9a

## 9. Post-Implementation Finalization

Per `.ai/templates/plan.md` §9:

- Remove unused boilerplate (`server/utils/getBaseUrl.ts`, boilerplate demo components, etc.).
- Rewrite `README.md` — app description, admin vs visitor surfaces, API surface, data-object schemas, setup.
- Rewrite `server/tests/routes.test.ts` — new routes, new mocks.
- Commit → push → PR into main with `release` + `minor` labels.

## 10. Visual details from mockups (spec v1.2 embedded images)

Extracted from the 31 mockup screenshots delivered as the .docx of the spec. These are the specifics that don't live in the spec's prose — hand this section to the implementer as the source of truth for copy, layout order, and component variants.

### 10.1 Banner stack (top of every modal tab)

Priority order, top → bottom (a banner only renders if it has content):

1. **GREEN winner banner** — `"Your monster placed {1st|2nd|3rd} in {Category} in the vote that ended {Mon DD, YYYY}!"` + right-side text-link `See your monster →`. Pinned first on every tab. Shown until the player first views it, then cleared. Click routes to that monster (fallback: Gallery tab with `my monsters + award winners` filters pre-applied).
2. **BLUE completion banner** — `"Your section finished the monster!"` (or similar, depending on completion state). Same clearance rule.
3. **AMBER countdown banner** — `"{X} days and {Y} hours left to VOTE on last week's monsters!"` with a right-aligned dark `VOTE` pill button (jumps to Vote tab). Only shown while a vote cycle is active.
4. **BLUE advisory** — `"Next week's voting category: {Cutest} — FINISH your monsters by Sat 11:59 PM ET to enter them in next week's vote!"`.

Banners are dismissed by the acknowledgement endpoint on first-view; they are queued on visitor dataObject so subsequent sessions render at most one per category.

### 10.2 Main App modal — chrome

- Header: `Monster Mash` (bold) + subtitle `Create and vote with your friends!`; `X` close top-right.
- Three tabs, left to right: **Create · Gallery · Vote** (spec's v1.1 rename — old name was "View" for Gallery).
- Admin gear icon (⚙) top-right adjacent to the X. Non-admin: hidden.

### 10.3 Create tab

Card grid states (spec §Create tab + image11):

- **Create New Monster** — first card, always. Large `+` glyph tile.
- **In-progress card** — three horizontal section slots (head, torso, legs). Each slot renders one of:
  - `AVAILABLE` — grey silhouette + `Join` button.
  - `YOUR CLAIM` — your avatar + `Resume` button (only while within 30-min lock).
  - `SOMEONE ELSE CLAIMED` — locked pill with contributor name; no action.
  - `DONE` — shows the composed section art **if you've contributed to this monster**, else grey `?` placeholder tinted per section-status. The mockup emphasizes: your submitted work unlocks visibility to the other sections that are also done.
- Card ordering: Create-New first, then in-progress cards where the caller already has a claim, then in-progress cards with any AVAILABLE section, then remaining in-progress cards. 100-card cap; eldest by `lastEditedAt` evicted first.
- Admin trash icon per card (players don't see it). Confirm dialog is a separate variant of the delete flow — see §10.10.

### 10.4 Monster Builder drawer

- Drawer header pill (blue): `Building: {Head|Torso|Legs} · {N} of 3` where N is 1/2/3 based on how many sections are already submitted at the time the drawer opens.
- Layout: **left column — Live preview pinned** (labeled `Live preview · pinned`), stacked `<img>` layers; **right column — accordions**.
- Preview shows:
  - Your section rendering live as you pick (labeled `your {section}`).
  - Any already-submitted peer section rendered as dashed placeholder + caption `{username}'s {section} · done · hidden until you submit`. Once you submit your own section, peer sections become fully visible.
  - Any not-yet-built section as dashed placeholder + caption `{section} / not built yet`.
  - Sub-caption under preview explains the reveal rule: `Dashed = where your {section} meets the {adjacent}. (so you can't match your art to theirs)`.
- Accordions: one per category. Each header shows the category name + a status right-side chip: `chosen ✅` (green ring), or `Required ▾` (red text when incomplete). Only the actively-being-picked accordion is expanded; the others collapse.
- Category header row: `{Section} parts · {X} of {Y} chosen`.
- Tile grid inside an expanded accordion: rows wrap to option count (density is Lina's call — expect 3 or 4 across).
- **NONE tile** — for categories where "nothing" is a valid look (e.g. mouth, hair), include an explicit `NONE` tile: dashed red outline + no-entry symbol icon + label `NONE`. There are **no optional categories** and no category is labeled "optional".
- **Name-token picker** — separate box below the categories, labeled `First name` / `Last name` / `Title` depending on section. Renders as a `<select>` (a dropdown of ~30 authored names — no long scrolling list). Sub-caption: `Your pick becomes the monster's {FIRST name|LAST name|TITLE} · (torso picks the last name, legs picks the title)` — adapts to the current section.
- Bottom CTA: dark `Submit {section} (choose all 6 — {X} left)` disabled with a live count while incomplete; `Submit {section}` enabled once all categories AND the name token are picked.
- Submit fires a confirm modal: `Submit this Monster {Section}?` + explainer + `[Submit {Section}]` (primary dark) / `[Keep Building]` (outline).
- Footer copy: `EVERY category is required. Where "nothing" is a valid look the options include an explicit NONE tile.`

**Legs sub-rule (image5)**: some `legs.legs` tiles physically cannot host `legs.feet` (e.g. wheelchair, tentacles). When a `no-feet` leg is picked AFTER feet were already chosen (or vice versa), fire a modal whose two buttons carry the actual choice icons:

- `[Keep {feet-icon}]` — revert the leg pick.
- `[Use {legs-icon}]` — accept the new leg pick and clear the feet pick (grey out the feet category and label it disabled).

Incompatible leg tiles carry a small `no feet` pill in the corner so the interaction is legible before the modal fires.

### 10.5 Section-submitted celebration screen (drawer)

After Submit, before the "It's Alive!" completion moment (if the third section didn't land yet), the drawer shows:

- Title `Section submitted!` (or similar).
- Small monster silhouette + celebration confetti.
- `Name so far:` line with three underline slots — filled slots render the finished name token, empty slots render as underscored blanks (e.g. `___ Gribblesnort ___`).
- Any peer sections that ARE done render below the fold as reveals (art visible, "by {username}" caption).
- Bottom CTA: `Back to Monster Mash`.

### 10.6 Completion moment ("IT'S ALIVE!") screen (drawer)

Fires when the third section lands and the compositor+drop finishes.

- Title in green: `IT'S ALIVE!` with confetti dots background.
- Subtitle: `Your section finished the monster!`.
- Full composited monster art (large).
- Composed name below the art (two-line format: `{First Last}` / `the {Title}`).
- Attribution: `by {u1} · {u2} · {u3}` (contributor usernames, dot-separated).
- Three green ✓ bullets:
  1. `Placed in the world`
  2. `Added to the gallery`
  3. `Entered in the next vote` — sub-caption `if enough are finished — otherwise the one after` (conditional per the pool threshold).
- Primary CTA: dark `Download PNG` — opens the composited PNG in a **new browser tab** (iframe sandbox prevents an in-app save). Red sub-caption below the button: `opens the image in a new browser tab to save — not an in-app download`.
- Secondary CTA: outlined `Back to Monster Mash`.

### 10.7 Gallery tab

- Filter row: `Sort: Newest first ▼` dropdown · `☐ Show only my monsters` · `☐ Show only award winners`.
- `Show only my monsters` reads from the **visitor dataObject** (`contributedMonsters`), so it includes monsters that have already rotated out of the active 200-card gallery on the key asset.
- Card:
  - Optional dark ribbon at the top: `{1st|2nd|3rd} · {SILLIEST} · {Aug 26, 2026}` (`PLACE · CATEGORY · DATE`, per week's single category — spec's v1.1 shape).
  - Composed monster art centered.
  - Two-line name.
  - `{u1} · {u2} · {u3}` contributors, then `Born {Mon DD, YYYY}`.
  - Per-card `Download` button (same new-tab UX as §10.6).
- Green outline on cards where the caller is a contributor.
- Cap: 200 finished monsters (oldest by `lastEditedAt` drop off), PLUS all of the caller's own monsters (never dropped, keep their awards forever — sourced from visitor dataObject).

### 10.8 Vote tab

Three states (`state 1|2|3` in the mockup annotations):

- **State 1 — Scheduled but not open**: center card with a dashed grey icon, `No vote is running right now` H1, `The next vote goes live Sunday, {Sep 20, 2026}!` subtitle, `(it opens the first time someone opens the app that day)` fine print. If weekly voting is admin-OFF and no date is scheduled, the middle line reads: `Check in with your teacher about the next vote!`.
- **State 2 — Vote running** (image28):
  - Left card: amber panel with the countdown formatted as `{Xd} : {Yh} : {Zm}` (large monospace-feeling glyphs, colon separators — not prose). Line 2: `left to vote on last week's monsters!`. Line 3: `Times are a guide — the window opens and closes the next time someone opens the app.`
  - Right rail: `LAST WEEK'S WINNERS · {CATEGORY}` header + three small monster cards (1st / 2nd / 3rd), each with a place chip, tiny monster art, name, contributors.
  - Center: bold H1 `Which one is the {Category}?` — the category is mapped to a user-facing question:
    - `silliest` → `Which one is the Silliest?`
    - `cutest` → `Which one is the Cutest?`
    - `grumpiest` → `Which one is the Grumpiest?`
    - `best-dressed` → `Which one is the Best Dressed?`
    - `spookiest` → `Which one is the Spookiest?` — etc. (mapping lives in `shared/content/monsterMash.ts`.)
  - Two large monster cards side-by-side with a big `VS` chip in between. Each card has monster art, two-line name, dark `Vote for this one` primary button.
  - Bottom fine print: `You can vote once for every monster in the pool each day, and twice that across the cycle. Winners appear the next time you open the app after voting closes.`
- **State 3 — Not enough monsters yet** (image22): center card reads `Not enough monsters for a vote yet · X of the 10 monsters needed are in the pool`.

Winners row rules:

- Hidden entirely when there are no past winners.
- A deleted winner's card renders with a **dashed red border** placeholder art + `[Monster Deleted]` label + caption `place is kept`.

### 10.9 Trophy drawer

Two tabs at the top: `Leaderboard | Badges`.

**Leaderboard tab**:

- Header: `MONSTER MASH` small-caps eyebrow, then `AWARDS WON` H2 + sub-header `one list — ties break on monsters worked on`.
- Columns: `#` · `username` · `awards` · `built`.
- Rows: rank chip + name + numeric columns. Caller's row highlighted yellow.
- Cap: `top 25 only, this instance` (spec §Leaderboard). Sub-caption under the list confirms the cap.
- Admin-only footer: dashed-red-outline `Reset Leaderboard (admin only)`. Player build hides the button entirely.
- Reset confirm modal: `Reset leaderboard?` + body `All players' award counts and monsters-built totals start over from zero. Badges are not affected.` → `[Reset Leaderboard]` (red) / `[Keep Leaderboard]` (green outline).

**Badges tab**:

- Header: `YOUR BADGES · {X} of 38` progress line (numerator is caller's earned count).
- Four groups (rendered in this order): `For building` · `For voting` · `For visiting` · `For winning`.
- Badge tile:
  - Earned: gold circle icon + label below on a yellow/gold background.
  - Locked: grey padlock icon on grey circle, dimmed background, name label greyed.
- Badge names come from the spec's flat 38-badge list; the four group labels above are the UI grouping. `For winning` tiles are named after the category (`Silliest`, `Cutest`, `Best Dressed`, …); the underlying badge is `Winner: {Category} Monster`.

### 10.10 Single Monster View drawer

Opens when a player clicks any monster dropped in the world (`clickType: "link"` on the DroppedAsset with `?screen=single-monster&monsterId=…`).

Player variant:

- `MONSTER MASH` small-caps eyebrow.
- Two-line name.
- Award chip (only if awarded): `{1st|2nd|3rd} · {CATEGORY} · won {Mon DD, YYYY}`.
- Full composed monster art.
- Primary CTA: dark `Download PNG` + red sub-caption `opens the image in a new browser tab to save — not an in-app download`.
- No delete / no edit for players in v1.

Admin variant (image27):

- Adds a red trash icon at the top of the drawer with caption `admin only: delete (confirm)`.
- Delete confirm modal: `Delete {Monster Name}?` + body `It will be removed from the gallery and the world. If it's in this week's vote, it will be disqualified.` + red-body caution `Deletion is permanent: cleared from the key asset AND from all three user records.` → `[Delete Monster]` (red) / `[Keep Monster]` (green outline).
- Delete effect: removes the monster's dropped asset from the world, splices its id out of `keyAsset.monsters`, out of every contributor's `visitorDataObject.contributedMonsters`, and — if it's in the current vote pool — out of `currentVoteCycle.poolMonsterIds`.

### 10.11 Delete-in-progress-monster confirm

Distinct from the completed-monster delete (§10.10). In-progress monsters have no dropped asset yet, so the confirm body reads: `Delete this monster in progress? {N} section(s) have been submitted by {list of contributors}. This cannot be undone.` Same red/green button pattern.

### 10.12 Race dialog — "Oops, that one was just claimed!"

Fires when the caller taps `Join` on an AVAILABLE section but the section flipped to `locked` between the last poll and the click (server returns `409`). Modal body: `Oops, that one was just claimed!` → `[Back to the list]` (outline, closes drawer, refetches Create tab) / `[Start a new monster]` (dark primary, calls `POST /monsters/start` for the caller).

### 10.13 Admin Settings (modal overlay, admin-only)

- Opens from admin gear icon on the main-app modal.
- Header: `Admin Settings [admins only]` chip.
- Back-link: `← Back to Monster Mash`.
- **Weekly voting** toggle: `Runs the automatic weekly submission and voting windows (Sunday to Saturday, ET). When OFF: no new votes start, no awards are given, and the Vote tab shows the "no active vote" state ("Check in with your teacher about the next vote!").`
- Toggle rendered as a green ON / grey OFF slider.
- Turning OFF while a vote is running fires: `Turn off weekly voting?` modal — `The current vote will end right away and no awards will be given for it. Players can still build monsters.` → `[Keep Voting On]` (green outline) / `[End Vote & Turn Off]` (red primary).
- Reserved space for future admin settings (`( future admin settings )` dashed placeholder in the mockup — nothing to build in v1).

### 10.14 Info sign (world) → How-to drawer

Third clickable in the world (see §1). Opens a fixed-width drawer whose sole content is the how-to image (a static explainer graphic — spec expects a single image; placeholder can be dropped in `client/public/how-to.png`). The image URL is overridable via `keyAsset.howToImageUrl`.

### 10.15 Copy inventory (short quote sheet)

Grouped so implementer can copy verbatim without re-scanning the spec:

- Modal subtitle: `Create and vote with your friends!`
- Amber countdown line 1: `{Xd} : {Yh} : {Zm}`; line 2: `left to vote on last week's monsters!`; line 3: `Times are a guide — the window opens and closes the next time someone opens the app.`
- Vote CTA on cards: `Vote for this one`
- Vote empty (pool short): `Not enough monsters for a vote yet · X of the 10 monsters needed are in the pool`
- Vote empty (scheduled): `The next vote goes live Sunday, {Mon DD, YYYY}!` + `(it opens the first time someone opens the app that day)`
- Vote empty (admin OFF): `Check in with your teacher about the next vote!`
- Download PNG sub-caption (everywhere): `opens the image in a new browser tab to save — not an in-app download`
- Section-submit confirm: `Submit this Monster {Head|Torso|Legs}?` · `[Submit {Section}]` / `[Keep Building]`
- Completion title: `IT'S ALIVE!` · subtitle: `Your section finished the monster!`
- Delete confirm (finished): `Delete {Name}?` — see §10.10 body
- Delete confirm (in-progress): see §10.11
- Race dialog: `Oops, that one was just claimed!`
- Admin voting-off confirm: `Turn off weekly voting?` — see §10.13
- Leaderboard reset: `Reset leaderboard?` — see §10.9
- Deleted-winner label on Vote-tab winners row: `[Monster Deleted]` + `place is kept`

---
