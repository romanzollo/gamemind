# GameMind — Quiz Images Guide

How to collect screenshots for `IMAGE_GUESS`, optimize them, and put them into the app.

## Target technical specs

| Parameter | Value |
|-----------|--------|
| Aspect ratio | preserve source (optimize uses `inside`, no crop) |
| Output size | max **1280 × 720** (fits inside the box) |
| Format | **WebP** |
| Quality | ~**80** (script default) |
| File size | ideally **&lt; 150–200 KB** |
| Quiz UI | `object-contain` in muted frame — **full image visible** |
| DB storage | **URL only** in `QuestionAsset` (never image bytes) |
| App path (MVP) | `/quiz-images/{easy\|medium\|hard}/{slug}.webp` |

UI note: the quiz card uses `object-contain` so the **entire** screenshot is visible (letterboxing on non-matching ratios). Do not use `object-cover` for IMAGE_GUESS prompts.

---

## 1. Screenshot checklist (current 9 `IMAGE_GUESS` seed questions)

Drop source files into `raw-quiz-images/{difficulty}/` with the **exact filename** below (any of: `.png` `.jpg` `.jpeg` `.webp` `.avif`).  
Then run `npm run images:optimize`.

Mark done when the WebP exists under `public/quiz-images/` and the quiz/admin URL points to `.webp` (not `.svg`).

### Easy

| # | Game | Output file | What to capture (idea) | Done |
|---|------|-------------|------------------------|------|
| 1 | Super Mario Bros. | `easy/super-mario-bros.webp` | Classic side-scroller: bricks, pipes, Mario in World 1-1. Avoid pause menu. | [x] |
| 2 | The Legend of Zelda (NES) | `easy/legend-of-zelda.webp` | Overworld bushes + brown hills, or a recognisable dungeon entrance. | [x] |
| 3 | Pokémon Red / Blue | `easy/pokemon-red-blue.webp` | Classic Game Boy battle or overworld (tall grass + trainer). | [x] |

### Medium

| # | Game | Output file | What to capture (idea) | Done |
|---|------|-------------|------------------------|------|
| 4 | The Witcher 3 | `medium/the-witcher-3.webp` | Toussaint / Velen landscape with Geralt visible, HUD minimal or cropped out. | [x] |
| 5 | Elden Ring | `medium/elden-ring.webp` | Open vista + Traveler's armor / Torrent, or a famous landmark (Tree, Ruins). | [x] |
| 6 | Final Fantasy VII (classic or Remake) | `medium/final-fantasy-vii.webp` | Midgar / Cloud party shot that reads clearly as FFVII. Stay consistent with the answer text. | [x] |

### Hard

| # | Game | Output file | What to capture (idea) | Done |
|---|------|-------------|------------------------|------|
| 7 | Tetris | `hard/tetris.webp` | Classic well + falling tetrominoes; avoid modern mobile UI if possible. | [x] |
| 8 | Doom (1993) | `hard/doom-1993.webp` | VGA FPS corridor, shotgun / imp, classic HUD — era must read as 90s Doom. | [x] |
| 9 | Metal Gear Solid (PS1) | `hard/metal-gear-solid.webp` | Shadow Moses corridor, Snake in sneaking suit, or Soliton radar vibe. | [x] |

### After files are ready

1. ~~`npm run images:optimize`~~
2. ~~Switch seed paths `.svg` → `.webp`~~
3. ~~`npm run images:update-db`~~ (or full `npm run db:seed`)
4. Open a quiz session and check crop/focus.
5. Optional: replace low-res easy sources if upscaling looks soft.

---

## 2. Script spec — `optimize-quiz-images`

**File:** `scripts/optimize-quiz-images.cjs`  
**Command:** `npm run images:optimize`

### Purpose

Take raw screenshots from `raw-quiz-images/`, produce quiz-ready WebP files in `public/quiz-images/`.

### Inputs

```txt
raw-quiz-images/
  easy/
    super-mario-bros.png    # or .jpg / .jpeg / .webp / .avif
  medium/
    elden-ring.jpg
  hard/
    doom-1993.png
```

Filename **stem** (without extension) must match the seed slug.

### Processing steps (per file)

1. Read source from `raw-quiz-images/{difficulty}/{stem}.*`
2. Resize with **trim** (remove black borders) then **inside** max box — **no crop**
3. Pixel art (≤360px sources): upscale with **nearest** kernel to ~960px wide for readability
4. Encode **WebP** quality **80**
4. Write `public/quiz-images/{difficulty}/{stem}.webp`
5. Print output path + approximate byte size; warn if &gt; 200 KB

### CLI flags

| Flag | Default | Meaning |
|------|---------|---------|
| `--dry-run` | off | List what would be written, do not write |
| `--width` | `1280` | Output width |
| `--height` | `720` | Output height |
| `--quality` | `80` | WebP quality 1–100 |
| `--fit` | `inside` | `inside` (no crop) or `cover` (crop to box — avoid for guess prompts) |

### Non-goals

- Do **not** upload to Blob/R2 (admin CDN upload is a later step).
- Do **not** touch Neon / Prisma.
- Do **not** run inside `startQuizAction`.
- Do **not** require images in Postgres.

### Dependency

Uses **`sharp`** (devDependency). Install once: `npm install`.

---

## 3. Where to find screenshots

Prefer **your own captures**. Use external sources only when you understand the license.

### Best (recommended)

| Source | Notes |
|--------|--------|
| **Own gameplay** | Steam F12, Xbox Game Bar (`Win+G`), ShareX, NVIDIA ShadowPlay |
| **Official press / media kits** | Publisher “Press” pages, event kits | Often allow promo use; read the license |
| **Console capture** | Switch / PS / Xbox media gallery export | Good quality, your session |

### Useful reference / research (do not hotlink permanently)

| Resource | URL | Use for |
|----------|-----|---------|
| MobyGames screenshots | https://www.mobygames.com/ | Era-correct classic frames (check reuse terms) |
| Steam store / news | game store page | Art direction reference — download only if license allows; better re-shoot |
| IGDB | https://www.igdb.com/ | Covers + metadata; covers ≠ level screenshots |
| RAWGF | https://rawg.io/ | Similar to IGDB |
| Presskit()-style studio pages | studio sites | Legal promo stills |
| Wikipedia / Wikimedia Commons | commons.wikimedia.org | Only files with clear free licenses |
| Squoosh (manual tweak) | https://squoosh.app/ | One-off compress if you skip the script |

### Avoid

- Google Images / Pinterest bulk downloads  
- Hotlinking random CDNs in `QuestionAsset.url`  
- AI “fake screenshots” as if they were the real game  
- Putting multi‑MB originals into `public/` without optimizing  

### Legal note (portfolio MVP)

For a **personal learning / portfolio** project, preference is: games you own + your screenshots, or press assets with clear terms.  
For a **public commercial** product, treat every image as needing a license check and record `source` / `gameTitle` in metadata later.

---

## 4. Workflow summary

```txt
Play / capture → put file in raw-quiz-images/{difficulty}/{slug}.png
       ↓
npm run images:optimize
       ↓
public/quiz-images/{difficulty}/{slug}.webp
       ↓
Update seed / admin URL → /quiz-images/.../slug.webp
       ↓
Quiz session loads URL from snapshot (next/image)
```

Later: admin uploads → Vercel Blob / R2 → HTTPS URL in `QuestionAsset` (see ROADMAP §10).

---

## 5. Batch Aug 2026 — 90 new IMAGE_GUESS (30 per difficulty)

**Manifest (answers + distractors + hints):** `content/drafts/batches/2026-08-05-image-guess-90.json`  
**Does not replace** the original 9 seed IMAGE_GUESS (§1). Avoid those slugs.

### Where to drop files

```txt
raw-quiz-images/
  easy/{slug}.png|jpg|webp|…
  medium/{slug}.png|jpg|webp|…
  hard/{slug}.png|jpg|webp|…
```

**Stem must match exactly** (no spaces; lowercase kebab-case). Extension can be png/jpg/jpeg/webp/avif.

### After you finish collecting

1. `npm run images:optimize` → writes `public/quiz-images/{easy|medium|hard}/{slug}.webp`
2. Import DRAFT rows + `QuestionAsset` (seed-style Neon client; never auto-PUBLISH):

```bash
npm run content:import-image-guess -- --dry-run
npm run content:import-image-guess
# prod (needs PROD_DATABASE_URL_UNPOOLED in .env):
npm run content:import-image-guess -- --target=prod --dry-run
npm run content:import-image-guess -- --target=prod
```

3. Admin: filter **DRAFT** → review → **Publish** (quality gate).
4. Commit/deploy WebP under `public/quiz-images/` so prod can serve them (`docs/DEPLOY.md`).
   - **Aug 6 lesson:** DB rows alone are not enough. Until WebP are on Vercel, admin thumbs and quiz images 404.

### Import / publish status

| When | Target | Host | Rows `img-*` | PROMPT asset | `publicationStatus` |
|------|--------|------|--------------|--------------|---------------------|
| Aug 6 | Local Neon | `ep-jolly-river…` | 90 | 90 | DRAFT (import) |
| Aug 6 | Prod Neon | `ep-red-mountain…` | 90 | 90 | DRAFT (import) |
| Aug 12 | Local + prod | same hosts | 90 | 90 | **PUBLISHED** (verified) |

**Verify (read-only):** `npm run content:smoke-image-guess` / `-- --target=prod` — script `scripts/smoke-image-guess-publish-status.cjs`. Expect `PUBLISHED: 90`, no missing PROMPT / WebP on disk.

**Next:** quiz + lightbox smoke (light/dark) — see **§6**. Optional more TEXT batches. Seed ×9 IMAGE_GUESS remain separate. Do **not** auto-PUBLISH from import CLI.

### Neon / script rules (do not re-break)

Canon script: `scripts/import-image-guess-batch.cjs` (pattern from `seed.cjs` + `update-quiz-image-assets.cjs`).

| Do | Don't |
|----|--------|
| Fresh `pg` Client per question body | One connection for all 90 |
| Separate fresh Client for `QuestionAsset` upsert | Multi-minute open transaction across many statements |
| `client.on('error', …)` + retry transient | Let unhandled `error` kill the process |
| `ssl: { rejectUnauthorized: false }` (Windows + Neon) | Assume `verify-full` always works mid-batch |
| Sleep ~500ms between questions; clear stale idle backends periodically | `query_timeout` that leaves zombie `idle` backends |
| Idempotent upsert by `draftKey` as Question `id` | Random UUID every run → duplicate DRAFTs |
| `publicationStatus = DRAFT` on insert | Auto-PUBLISH |
| `--target=prod` only with `PROD_DATABASE_URL_UNPOOLED` + host ≠ `jolly-river` | Point local `.env` at prod by accident |

### Exact filenames (90)

#### Easy → `raw-quiz-images/easy/`

| File stem | Game |
|-----------|------|
| `minecraft` | Minecraft |
| `fortnite` | Fortnite |
| `among-us` | Among Us |
| `gta-v` | Grand Theft Auto V |
| `animal-crossing-new-horizons` | Animal Crossing: New Horizons |
| `super-mario-odyssey` | Super Mario Odyssey |
| `sonic-the-hedgehog` | Sonic the Hedgehog |
| `pac-man` | Pac-Man |
| `overwatch-2` | Overwatch 2 |
| `league-of-legends` | League of Legends |
| `rocket-league` | Rocket League |
| `fall-guys` | Fall Guys |
| `the-sims-4` | The Sims 4 |
| `cuphead` | Cuphead |
| `stardew-valley` | Stardew Valley |
| `kirby-and-the-forgotten-land` | Kirby and the Forgotten Land |
| `splatoon-3` | Splatoon 3 |
| `mario-kart-8-deluxe` | Mario Kart 8 Deluxe |
| `portal` | Portal |
| `skyrim` | The Elder Scrolls V: Skyrim |
| `god-of-war-2018` | God of War (2018) |
| `marvels-spider-man` | Marvel’s Spider-Man |
| `halo-combat-evolved` | Halo: Combat Evolved |
| `crash-bandicoot` | Crash Bandicoot |
| `street-fighter-ii` | Street Fighter II |
| `undertale` | Undertale |
| `terraria` | Terraria |
| `genshin-impact` | Genshin Impact |
| `ea-sports-fc` | EA Sports FC |
| `assassins-creed-odyssey` | Assassin’s Creed Odyssey |

#### Medium → `raw-quiz-images/medium/`

| File stem | Game |
|-----------|------|
| `the-last-of-us` | The Last of Us |
| `uncharted-4` | Uncharted 4 |
| `ghost-of-tsushima` | Ghost of Tsushima |
| `sekiro` | Sekiro: Shadows Die Twice |
| `bloodborne` | Bloodborne |
| `baldurs-gate-3` | Baldur’s Gate 3 |
| `persona-5` | Persona 5 |
| `cyberpunk-2077` | Cyberpunk 2077 |
| `red-dead-redemption-2` | Red Dead Redemption 2 |
| `horizon-zero-dawn` | Horizon Zero Dawn |
| `death-stranding` | Death Stranding |
| `hollow-knight` | Hollow Knight |
| `hades` | Hades |
| `celeste` | Celeste |
| `bioshock` | BioShock |
| `mass-effect-2` | Mass Effect 2 |
| `dark-souls` | Dark Souls |
| `resident-evil-4` | Resident Evil 4 |
| `silent-hill-2` | Silent Hill 2 |
| `dishonored` | Dishonored |
| `control` | Control |
| `outer-wilds` | Outer Wilds |
| `disco-elysium` | Disco Elysium |
| `nier-automata` | NieR:Automata |
| `helldivers-2` | Helldivers 2 |
| `subnautica` | Subnautica |
| `no-mans-sky` | No Man’s Sky |
| `it-takes-two` | It Takes Two |
| `yakuza-0` | Yakuza 0 |
| `monster-hunter-world` | Monster Hunter: World |

#### Hard → `raw-quiz-images/hard/`

| File stem | Game |
|-----------|------|
| `ico` | Ico |
| `shadow-of-the-colossus` | Shadow of the Colossus |
| `journey` | Journey |
| `rez` | Rez |
| `jet-set-radio` | Jet Set Radio |
| `shenmue` | Shenmue |
| `grim-fandango` | Grim Fandango |
| `myst` | Myst |
| `system-shock-2` | System Shock 2 |
| `thief-the-dark-project` | Thief: The Dark Project |
| `deus-ex` | Deus Ex |
| `planescape-torment` | Planescape: Torment |
| `earthbound` | Earthbound |
| `chrono-trigger` | Chrono Trigger |
| `castlevania-symphony-of-the-night` | Castlevania: Symphony of the Night |
| `killer7` | killer7 |
| `psychonauts` | Psychonauts |
| `okami` | Ōkami |
| `katamari-damacy` | Katamari Damacy |
| `eternal-darkness` | Eternal Darkness |
| `goldeneye-007` | GoldenEye 007 |
| `perfect-dark` | Perfect Dark |
| `ikaruga` | Ikaruga |
| `hotline-miami` | Hotline Miami |
| `papers-please` | Papers, Please |
| `return-of-the-obra-dinn` | Return of the Obra Dinn |
| `braid` | Braid |
| `spelunky` | Spelunky |
| `xenogears` | Xenogears |
| `vagrant-story` | Vagrant Story |

Capture tips per game live in the JSON (`captureHint`). Prefer your own screenshots; see §3 for sources.

---

## 6. Lightbox UX (quiz + result review)

**Component:** `src/features/quiz/components/QuestionImage.tsx` (also used from `QuestionCard` / `QuizResultReview`).

**Open:** click / activate preview (`cursor-zoom-in`).

**Close (no visible Close button):**
- Desktop: click anywhere on the overlay; keyboard `Escape` / `Enter` / `Space` / `Backspace`
- Mobile: **pinch** to zoom further (1×–4×) and pan while zoomed; **single tap** closes when scale≈1, or resets zoom when already pinched
- Ghost-tap guards: ignore dismiss for ~280ms after open; ignore re-open for ~400ms after touch-close
- Do **not** dismiss on `pointerdown` for touch (that blocked pinch)

**Scrim (Scoreboard Editorial):**
- Light: `bg-black/55` + light blur
- Dark: `bg-black/80` + slightly stronger blur
- **Never** `bg-foreground/*` for the overlay — in dark theme `--foreground` is light text, so the scrim becomes a milky veil
- Frame: thin `ring-white/10`, soft black shadow; still `object-contain` full frame (no crop)

**a11y:** `role="dialog"` `aria-modal`; focus dialog on open; restore focus to preview button on close; `closeLabel` remains as `aria-label` (not a visible button). i18n: `quiz.imageExpandHint` / `imageExpandLabel` / `imageCloseLabel`.

**Do not:** glow effects; `object-cover` crop; change scoring/snapshot for lightbox.

### Smoke checklist (after Publish)

**DB first (read-only):**

```powershell
npm run content:smoke-image-guess
# optional: npm run content:smoke-image-guess -- --target=prod
```

Expect: `img-*` PUBLISHED 90; quiz pool IMAGE_GUESS = all PUBLISHED+active (batch + seed + any later waves — local may be ≫ 99).

**UI (local `npm run dev`, then optionally www):**

1. Theme **light** → `/ru/quiz` → Classic **Easy** 10Q → start.
2. When an `IMAGE_GUESS` appears: full screenshot visible (`object-contain`, no crop); click → lightbox.
3. Lightbox: dark scrim (not milky); Esc / click overlay closes; no visible Close button.
4. Switch **dark** theme (same session or new): scrim darker (`bg-black/80`), still readable; dismiss still works.
5. Optional: finish quiz → result review → same lightbox on IMAGE_GUESS row.
6. Optional prod: one Classic Easy on `www.game-mind.ru` — image URL 200 (not 404).

Pass = images load + lightbox open/close in light and dark. Fail = 404 WebP, milky scrim, or crop/`object-cover`.

**Do not:** change `SNAPSHOT_RESOLVE_CHUNK_SIZE`, submit hot path, or cycle for this smoke.
