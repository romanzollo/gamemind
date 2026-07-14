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
