# GameMind — Content Scale Pipeline (draft JSON → import → review → publish)

How to grow the question bank **without** typing every row in admin and **without** turning `scripts/seed-questions.cjs` into a content CMS.

Related canon:

- Bilingual rules + **stem / similar-question rule:** `docs/QUESTION_I18N.md` (§1–§3 options including **§3 D** plausible distractors, **§10 stems**)
- Lifecycle: `publicationStatus` DRAFT → IN_REVIEW → PUBLISHED (orthogonal to `isActive`)
- Quality gate: `getQuestionPublishQualityIssues` (`src/features/admin/lib/question-publish-quality.ts`)
- Seed shape reference only: `scripts/seed-questions.cjs` (`Q` / `opt`)
- **Quiz Neon hot path:** `docs/QUIZ_NEON_HOT_PATH.md` — adding questions must **not** change submit/result to write large JSONB on complete; content scale stays on draft→publish only.

**Authoring tip (product taste):** prefer **interesting game-mechanics** questions (systems players feel: dash refill, posture, parry, resource loops) over trivia that repeats seed facts. Still run a quick duplicate check vs seed + prior batches before Publish. Stem wording and **similar-question** rule: `QUESTION_I18N.md` §10 (game in the first clause; do not clone another item’s loop, hands-feel, or syntactic machine). Wrong options: `QUESTION_I18N.md` **§3 D** — plausible mix-ups, not cartoon leftovers a non-player can discard. Do not overdo with three near-twins of the correct answer.

**Next authoring target (Aug 18 night):** Mechanics TEXT **wave 5** ×24 is **done** local+prod (`2026-08-18-text-mechanics-w5-24.json`). TEXT quiz pool **378** (126/126/126); DRAFT 0. Stem canon: `QUESTION_I18N.md` §10. Distractors: **§3 D** (plausible mix-ups, not cartoon leftovers). Optional next: mechanics TEXT **wave 6** ×24 — **new loops only** (dupe-check vs seed + C/D + mechanics-12/w2/w3/w4/w5). Mix lobby stays **on www** — do not re-implement. New batches: validate → import DRAFT → `content:publish-text-drafts` (prod: `--target=prod --file=…`). Do not re-import C/D/fresh/sample/mechanics-12/w2-24/w3-24/w4-24/w5-24. Published stem fixes = UPDATE (`voice-pass-mechanics-stems.cjs`), never import.

---

## 1. Why this exists (product)

| Channel | Role | Scale |
|---------|------|--------|
| Admin create form | One-off edits, fixes, IMAGE_GUESS upload | Tens |
| `seed-questions.cjs` | Bootstrap / demo bank for empty DB | ~60 curated |
| **Draft JSON pipeline** | Batch authoring → import as DRAFT → human review → publish | Hundreds |

**Non-negotiable:** import never writes `PUBLISHED`. Only admin review + existing publish actions (with quality gate) put questions into the quiz pool (`isActive AND PUBLISHED`).

**Not in TEXT v1 of this pipeline:** IMAGE_GUESS / assets inside `draft-questions.v1`, auto-publish, taxonomy filters, AI calling prod DB directly.

**IMAGE_GUESS batch (sibling, Aug 2026):** separate manifest + `npm run content:import-image-guess` — still **DRAFT-only** + admin Publish. See `docs/QUIZ_IMAGES.md` §5–§6 and `DECISIONS.md` → IMAGE_GUESS Batch Import + Lightbox.

---

## 2. Terms (plain language)

| Term | Meaning |
|------|---------|
| **Draft (черновик)** | Question row with `publicationStatus = DRAFT`. Exists in DB, **not** in quiz pool. |
| **JSON contract** | Agreed file shape so humans, scripts, and later AI all emit the same structure. |
| **Validate** | Check the file against the contract *before* touching the database. |
| **Import** | Insert rows as DRAFT (reuse admin create path semantics). |
| **Quality gate** | Pure checks before submit-for-review / publish (empty text, duplicate options, etc.). |
| **Publish** | Explicit admin step: DRAFT/IN_REVIEW → PUBLISHED (still needs `isActive = true` for the pool). |

---

## 3. File layout

```txt
content/drafts/
  schema/
    draft-questions.v1.schema.json   # machine-readable contract (JSON Schema)
  examples/
    sample-text-v1.json              # 3 TEXT samples for CLI/learn — not in quiz pool
  batches/
    2026-08-03-text-mixed-v1.json    # early 3-Q experiment; not in pool (do not re-import)
    2026-08-04-text-fresh-45.json    # AI batch 15×3 (local+prod PUBLISHED)
    2026-08-04-text-fresh-60.json    # AI batch 20×3 (local+prod PUBLISHED)
    2026-08-05-image-guess-90.json   # IMAGE_GUESS ×90 (sibling; local+prod PUBLISHED)
    2026-08-07-image-guess-72.json   # IMAGE_GUESS ×72 wave 2 (local+prod PUBLISHED)
    2026-08-07-text-wave-c1-36.json  # TEXT ×36 C1 (local+prod PUBLISHED)
    2026-08-07-text-wave-c2-36.json  # TEXT ×36 C2 (local+prod PUBLISHED)
    2026-08-07-text-wave-c3-36.json  # TEXT ×36 C3 (local+prod PUBLISHED)
    2026-08-12-text-wave-d1-6.json   # TEXT ×6 D1 (local+prod PUBLISHED)
    2026-08-12-text-mechanics-12.json # TEXT ×12 mechanics (local+prod PUBLISHED)
    2026-08-13-text-mechanics-w2-24.json # TEXT ×24 mechanics wave 2 (local+prod PUBLISHED)
    2026-08-13-text-mechanics-w3-24.json # TEXT ×24 mechanics wave 3 (local+prod PUBLISHED)
    2026-08-17-text-mechanics-w4-24.json # TEXT ×24 mechanics wave 4 (local+prod PUBLISHED)
    2026-08-18-text-mechanics-w5-24.json # TEXT ×24 mechanics wave 5 (local+prod PUBLISHED)

src/features/content/lib/
  draft-questions.schema.ts          # Zod contract v1 (runtime)
  validate-draft-questions.ts        # validate without DB write
  validate-draft-questions.test.ts   # Vitest
  index.ts

scripts/validate-draft-questions.ts  # CLI validate (no Neon)
scripts/import-draft-questions.ts    # CLI import TEXT → DRAFT (needs .env)
scripts/import-text-drafts-to-prod.cjs  # wrapper: TEXT files → prod URL (host guard)
scripts/import-image-guess-batch.cjs # CLI import IMAGE_GUESS batch → DRAFT + asset
scripts/smoke-content-pipeline-status.ts  # read-only status of sample rows
scripts/smoke-image-guess-publish-status.cjs  # IMAGE_GUESS img-* + pool
scripts/smoke-text-bank-status.cjs   # TEXT by status + quiz pool
scripts/voice-pass-mechanics-stems.cjs # in-place UPDATE of published TEXT stems (not import)
```

npm scripts:
- `content:validate-drafts`
- `content:import-drafts` (add `--dry-run` first)
- `content:import-image-guess` / `--target=prod` (IMAGE_GUESS batch; see `QUIZ_IMAGES.md` §5)
- `content:smoke-status`
- `content:smoke-image-guess` / `--target=prod`
- `content:smoke-text` / `--target=prod`
- `content:publish-text-drafts` / `--dry-run` / `--target=prod --file=…` (quality gate; prod **requires** `--file` filter)


Authoring batches: `content/drafts/batches/YYYY-MM-DD-….json` (commit when you choose).

---

## 4. Draft JSON contract v1

Root object:

| Field | Required | Notes |
|-------|----------|--------|
| `version` | yes | Must be `1` |
| `source` | no | Hint only: `"manual"` \| `"ai"` \| `"api"` \| `"template"` |
| `questions` | yes | Non-empty array of draft question objects |

Each question object:

| Field | Required | Notes |
|-------|----------|--------|
| `type` | yes | v1: only `"TEXT"` |
| `difficulty` | yes | `"EASY"` \| `"MEDIUM"` \| `"HARD"` |
| `category` | no | Default on import: `"video-games"` |
| `metadata` | no | Free object (franchise, topic, game, …) — not used by quiz hot path |
| `draftKey` | no | Stable string for humans / future idempotent re-import (not a DB id) |
| `translations.ru.text` | yes | Non-empty after trim |
| `translations.en.text` | yes | Non-empty after trim |
| `options` | yes | Exactly **4** options in v1 (stricter than admin Zod 2–6) |
| `options[].isCorrect` | yes | Exactly **one** `true` in the array |
| `options[].translations.ru.text` | yes | Non-empty |
| `options[].translations.en.text` | yes | Non-empty |

**Explicitly omitted from the file (set by import / admin):**

- DB `id` — generated on import
- `publicationStatus` — always `DRAFT` on import
- `isActive` — follow admin create (active row, still hidden from pool while DRAFT)
- Prompt image / `IMAGE_GUESS` — TEXT contract only; IMAGE_GUESS batch = sibling importer (`QUIZ_IMAGES.md` §5)

Mirror of seed helpers (shape only):

```js
// seed-questions.cjs mental model
Q(num, difficulty, metadata, ru, en, [
  opt(true, '…', '…'),
  opt(false, '…', '…'),
  opt(false, '…', '…'),
  opt(false, '…', '…'),
])
```

Same bilingual rules as `QUESTION_I18N.md`: strategy A (localize all) or B (shared Latin titles for all four) — never mix Cyrillic correct + English-only distractors.

---

## 5. Pipeline (target flow)

```txt
author JSON  →  validate (schema + domain)  →  import as DRAFT
      →  admin list ?publication=DRAFT  →  edit / quality panel
      →  submit for review / publish (existing gate)
      →  quiz pool only after PUBLISHED + isActive
```

Later (Phase 5 leftover): AI/API emits **the same** `version: 1` JSON; humans still review.

---

## 6. Do not

- Paste hundreds of questions into `seed-questions.cjs` as the main channel
- Auto-set `PUBLISHED` on import
- Skip quality gate because “JSON already looked fine”
- Trust client-only checks for publish
- Start IMAGE_GUESS in the same batch as first TEXT import
- Change scoring / quiz snapshot / Neon Direct start paths for this feature
- Re-import the same TEXT JSON (new UUIDs → duplicates). IMAGE_GUESS batch upserts by `draftKey`
- Re-import mechanics-12 / w2 / w3 / w4 / w5 (or any published TEXT) “to fix wording” — that **adds** rows. Stem fix = `voice-pass-mechanics-stems.cjs` / UPDATE (`QUESTION_I18N.md` §10.4)
- Call `--write-json` on that script after hand-editing JSON (overwrites stems from the in-file map)
- Copy `sample-text-v1` / mixed experiments to prod just to match admin hub counts
- Clone another question’s loop, hands-feel, or syntactic machine (`QUESTION_I18N.md` §10.2)

---

## 7. Step status (learning track)

| Step | Status |
|------|--------|
| 1. Contract docs + JSON Schema + sample TEXT drafts | done |
| 2. Validate module (Zod / domain) without DB write | done |
| 3. CLI: validate a draft file | done |
| 4. Import script/action → DRAFT only | done |
| 5. Smoke: admin review → publish via existing UI | **done** (Aug 3) — ≥1 sample PUBLISHED; user confirmed quiz pool |
| 6. AI emits same JSON → batches → import → publish | **done** (Aug 4) — local + **prod** bank grown; Classic OK after prod migrate |

---

## 8. Verification

### Step 1 (contract)

- [x] `docs/CONTENT_PIPELINE.md` exists and matches this contract
- [x] `content/drafts/schema/draft-questions.v1.schema.json` exists
- [x] `content/drafts/examples/sample-text-v1.json` has exactly 3 TEXT questions, each with 4 bilingual options and one correct
- [x] Samples follow `QUESTION_I18N.md` (one strategy A character/place, one strategy B titles)
- [x] No `publicationStatus` / `isActive` / image fields in the sample file

### Step 2 (validate)

- [x] `validateDraftQuestionsBatch` rejects bad version / wrong correct count / duplicate `draftKey`
- [x] Sample file validates `ok: true`
- [x] Duplicate option text → `ok: true` but `hasPublishBlockers: true` (import later still allowed as DRAFT)
- [x] `npm run test -- src/features/content/lib/validate-draft-questions.test.ts` green

### Step 3 (CLI validate)

- [x] `npm run content:validate-drafts` checks sample by default
- [x] Contract fail → exit code 1
- [x] Optional `--fail-on-publish-blockers` for stricter CI-style checks
- [x] Still no DB write on validate CLI

### Step 4 (import DRAFT)

- [x] `mapDraftQuestionToCreateInput` + `importDraftQuestionsBatch`
- [x] Reuses `questionRepository.createWithOptions` (always DRAFT in SQL)
- [x] New UUID per row (not idempotent; safe vs overwriting PUBLISHED)
- [x] `--dry-run` and real import of sample verified locally
- [x] Never sets `PUBLISHED` in this path

### Step 5 (admin smoke — human)

- [x] `content:smoke-status` shows imported samples (DRAFT and/or PUBLISHED)
- [x] ≥1 sample published via existing admin UI + quality gate (Portal EASY)
- [x] User confirmed published samples appear in quiz pool (Classic)

See §9 runbook for the repeatable checklist. No new publish code was added.

### Step 6 (AI emit + real batches)

- [x] AI-authored batches keep `version: 1` + `source: "ai"` (same contract as manual)
- [x] Local batches: `content/drafts/batches/2026-08-04-text-fresh-45.json` (15×3) + `…-fresh-60.json` (20×3)
- [x] Validate → import DRAFT (never PUBLISHED) → admin publish
- [x] Prod import uses **prod** Neon host (not local `.env` / `ep-jolly-river`)
- [x] User published on prod; Classic quiz works after prod schema catch-up (see §10)

---

## 9. Step 5 smoke runbook (review → publish)

**Goal:** prove the pipeline ends in the **existing** draft/review/publish + quality gate. No new publish code.

### Terms again

| Term | Meaning here |
|------|----------------|
| **Review** | Open edit page, read RU+EN, check quality panel |
| **Submit for review** | Optional: DRAFT → IN_REVIEW (solo admin may skip) |
| **Publish** | DRAFT or IN_REVIEW → PUBLISHED (runs `getQuestionPublishQualityIssues`) |
| **Quiz pool** | Only `PUBLISHED` **and** `isActive=true` |

### Before UI

```powershell
npm run content:smoke-status
```

Expect at least one `DRAFT` row for each sample RU text (or re-import if empty).

If nothing found:

```powershell
npm run content:import-drafts -- content/drafts/examples/sample-text-v1.json
npm run content:smoke-status
```

### In admin (with `npm run dev`)

1. Open `/ru/admin/questions?publication=DRAFT`
2. Find Portal / FromSoft / Columbia samples (search box or scroll)
3. Open **Edit** on Portal (strategy A — clean bilingual)
4. Check quality panel: ideally no blockers
5. Either:
   - **Submit for review** then **Publish**, or
   - **Publish** directly from DRAFT (allowed for solo admin)
6. Confirm badge → Published
7. Optional: publish Columbia the same way
8. FromSoft titles: may show warning `IDENTICAL_OPTION_LOCALES` (strategy B) — **warning does not block publish**
9. List filter `?publication=PUBLISHED` — rows visible
10. Start a short Classic quiz on `/ru/quiz` — if pool pick hits them, texts look coherent (not required to see all three)

### After UI

```powershell
npm run content:smoke-status
```

Expect some rows `PUBLISHED` (and still `active=true`).

### Cleanup (optional)

Duplicate DRAFTs from repeated imports: deactivate or delete extras in admin. Do not leave junk PUBLISHED if you were only testing.

### Do not

- Change scoring / snapshot / import to auto-PUBLISH
- Skip quality panel “because JSON validated”
- Publish IMAGE_GUESS without assets (not in this sample)

---

## 10. Prod ops (import + schema) — Aug 4 lesson

**Local and prod Neon are different projects.** Importing with local `DATABASE_URL` never updates `www.game-mind.ru`.

### Import drafts to prod

1. Take **Production** `DATABASE_URL_UNPOOLED` from Neon Console or Vercel (Reveal). Confirm host ≠ local (`ep-jolly-river…`).
2. Dry-run, then real:

```powershell
$env:DATABASE_URL_UNPOOLED = "postgresql://…prod-unpooled…"
npm run content:import-drafts -- content/drafts/batches/<file>.json --dry-run
npm run content:import-drafts -- content/drafts/batches/<file>.json
Remove-Item Env:DATABASE_URL_UNPOOLED
```

3. Admin on prod: `?publication=DRAFT` → review → Publish.
4. Do **not** paste secrets into git. Rotate Neon password if it was shared in chat.

**Note:** `vercel env pull` may download Encrypted vars as empty `""` — use Console Reveal / Neon instead.

### Schema must match deployed code

Vercel JS does **not** apply Prisma migrations. Publishing questions does **not** apply schema.

**Aug 4:** result soft-fail; Vercel `relation "AchievementOutbox" does not exist` (`42P01`). Prod lagged `AchievementOutbox` / review columns.

**Aug 15:** Classic/Blitz start UI «Проверь сложность и количество вопросов.»; Vercel `column "poolKind" of relation "QuizSession" does not exist` (`42703`). Mix JS on Vercel already wrote `poolKind`; prod lacked `20260813220000_quiz_session_pool_kind`. **Not** a hot-path / handoff / clock bug — do not change start/submit/Direct. After catch-up, user-verified on www: Classic EASY 3, Classic MIX, Blitz EASY, Blitz MIX → questions on screen → submit → score.

Fix:

1. Confirm host ≠ local `ep-jolly-river…`. Use **`PROD_DATABASE_URL_UNPOOLED`** (direct, not `-pooler`). Do not point local `DATABASE_URL` at prod permanently.
2. Prefer `npx prisma migrate deploy` with those prod URLs in the **child process env**. Prisma may still print `Environment variables loaded from .env` — trust the printed datasource **host**, not that line.
3. Windows + Neon: `migrate deploy` can fail `P1002` (advisory lock timeout 10s) even when `pg_locks` has **no** advisory row. Fallback: apply `prisma/migrations/<name>/migration.sql` on prod unpooled, then register `_prisma_migrations` (sha256 of the file) — same idea as `scripts/apply-named-migration.cjs <name> PROD_DATABASE_URL_UNPOOLED` — or `migrate resolve --applied` if the engine can take the lock. Confirm column/enum exist. Checksum must match hashing an already-applied `migration.sql` the same way.
4. Play a **new** quiz. Redeploy is not required if the JS is already on Vercel. Old failed sessions can stay.

Canon: `docs/QUIZ_NEON_HOT_PATH.md` — content scale must not change submit JSONB; a `42703` on start is ops, not a pick/Direct rewrite.

### IMAGE_GUESS prod import (Aug 6)

```powershell
# Requires PROD_DATABASE_URL_UNPOOLED in .env (host must be prod, not jolly-river)
npm run content:import-image-guess -- --target=prod --dry-run
npm run content:import-image-guess -- --target=prod
```

Then: Admin DRAFT → Publish. **Also** ensure `public/quiz-images/**` WebP are committed and deployed — otherwise thumbs/quiz images 404 while DB URLs look correct.

### Local vs prod drift (Aug 12 lesson)

Admin hub counts **all** `isActive` rows (including DRAFT). A gap there is almost always **missing batches on one Neon**, not a UI bug.

**Aug 12:** prod had TEXT waves C1–C3 (×108) that local lacked → hub 435 vs 341. IMAGE_GUESS was already in sync (`img-*` ×90 + `img2-*` ×72 + seed ×9). After local import+publish of C1–C3, local still had **8 extras** (pipeline samples, mixed Hyrule/Switch, two July admin TEXT, one July test IMAGE_GUESS). Those were **deleted on local only** — not copied to prod.

**Bank after cleanup (both Neons, Aug 12):** TEXT quiz pool **270** (90/90/90) + IMAGE_GUESS **171** → admin ~**441**.

**Aug 13:** mechanics TEXT ×12 published both sides → TEXT **282** (94/94/94) + IMAGE **171** → admin ~**453**.

**Aug 13 (later):** mechanics TEXT wave 2 ×24 (`2026-08-13-text-mechanics-w2-24.json`) published both sides → TEXT **306** (102/102/102) + IMAGE **171** → admin ~**477**.

**Aug 13 (evening):** mechanics TEXT wave 3 ×24 (`2026-08-13-text-mechanics-w3-24.json`) published both sides → TEXT **330** (110/110/110) + IMAGE **171** → admin ~**501**.

**Aug 18:** mechanics TEXT wave 4 ×24 (`2026-08-17-text-mechanics-w4-24.json`) published both sides → TEXT **354** (118/118/118) + IMAGE **171** → admin ~**525**.

**Aug 18 (evening):** voice-pass stems on mechanics-12 / w2 / w3 — **UPDATE in place** local+prod (`scripts/voice-pass-mechanics-stems.cjs`). Same 60 UUIDs; options unchanged. Pool still **354**; DRAFT did not grow. Do not re-import those files. Stem rules: `QUESTION_I18N.md` §10.

**Aug 18 (night):** mechanics TEXT wave 5 ×24 (`2026-08-18-text-mechanics-w5-24.json`) published both sides → TEXT **378** (126/126/126) + IMAGE **171** → admin ~**549**. Distractors: `QUESTION_I18N.md` §3 D. Do not re-import. Verify:

```powershell
npm run content:smoke-text
npm run content:smoke-text -- --target=prod
npm run content:smoke-image-guess
npm run content:smoke-image-guess -- --target=prod
```

Helper for TEXT → prod without swapping `.env`: `node scripts/import-text-drafts-to-prod.cjs <files…>` (refuses `jolly-river`). Then publish with `content:publish-text-drafts -- --target=prod --file=…` (prod **requires** `--file`; bulk cap 100).

**Do not:** dump one Neon onto the other; re-import C/D/fresh/samples/mechanics-12/w2-24/w3-24/w4-24/w5-24; treat hub “active” as quiz pool (`PUBLISHED + isActive`).
