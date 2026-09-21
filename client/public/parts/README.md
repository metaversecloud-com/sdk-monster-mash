# Monster Mash — Placeholder Part Art

Drop finished PNG art here in the shape:

```
client/public/parts/
├── head/
│   ├── headShape/
│   │   ├── round.png
│   │   ├── square.png
│   │   └── jack-o-lantern.png
│   ├── nose/
│   ├── eyes/
│   ├── mouth/
│   └── hair/
├── torso/
│   ├── shirt/
│   ├── arms/
│   ├── sleeves/
│   ├── collar/
│   └── torsoBack/
└── legs/
    ├── legs/
    ├── feet/
    ├── waist/
    ├── belt/
    └── legsBack/
```

## Rules

1. **All parts must share the same PNG dimensions.** The compositor stacks
   layers without offset or scale (see [`shared/content/monsterMash.ts`](../../../shared/content/monsterMash.ts) → `LAYER_ORDER`).
2. **Transparent backgrounds required.** Every non-part pixel is `rgba(0,0,0,0)`.
3. **File name matches the `imageName` field** on the part in `shared/content/monsterMash.ts`.
4. **File path matches the part's `section/categoryId`** — e.g. `head/headShape/round.png` for `{ id: "round", section: "head", categoryId: "headShape" }`.

## Production

Local dev serves these files at `/parts/…` via Vite's static middleware. Production points `PARTS_BASE_URL` at an S3 bucket (spec §Content storage). When final art lands, either:

- Replace the files in this folder and rebuild the client, OR
- Upload the same directory tree to the production bucket and set `PARTS_BASE_URL=https://…s3….com/monster-mash/parts` in the client env.

The compositor (`server/utils/images/composeMonsterImage.ts`, coming in Epic 3) reads the same URL to fetch parts server-side for the finished-monster PNG.
