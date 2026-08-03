# GameMind — Content Scale Pipeline (draft JSON → import → review → publish)

How to grow the question bank **without** typing every row in admin and **without** turning `scripts/seed-questions.cjs` into a content CMS.

Related canon:

- Bilingual rules: `docs/QUESTION_I18N.md`
- Lifecycle: `publicationStatus` DRAFT → IN_REVIEW → PUBLISHED (orthogonal to `isActive`)
- Quality gate: `getQuestionPublishQualityIssues` (`src/features/admin/lib/question-publish-quality.ts`)
- Seed shape reference only: `scripts/seed-questions.cjs` (`Q` / `opt`)

---

## 1. Why this exists (product)

| Channel | Role | Scale |
|---------|------|--------|
| Admin create form | One-off edits, fixes, IMAGE_GUESS upload | Tens |
| `seed-questions.cjs` | Bootstrap / demo bank for empty DB | ~60 curated |
| **Draft JSON pipeline** | Batch authoring → import as DRAFT → human review → publish | Hundreds |

**Non-negotiable:** import never writes `PUBLISHED`. Only admin review + existing publish actions (with quality gate) put questions into the quiz pool (`isActive AND PUBLISHED`).

**Not in v1 of this pipeline:** IMAGE_GUESS / assets, auto-publish, taxonomy filters, AI calling prod DB directly.

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
    sample-text-v1.json              # 3 TEXT bilingual samples

src/features/content/lib/
  draft-questions.schema.ts          # Zod contract v1 (runtime)
  validate-draft-questions.ts        # validate without DB write
  validate-draft-questions.test.ts   # Vitest
  index.ts

scripts/validate-draft-questions.ts  # CLI validate (no Neon)
scripts/import-draft-questions.ts    # CLI import → DRAFT (needs .env)
scripts/smoke-content-pipeline-status.ts  # read-only status of sample rows
```

npm scripts:
- `content:validate-drafts`
- `content:import-drafts` (add `--dry-run` first)
- `content:smoke-status`

Authoring batches later: e.g. `content/drafts/batches/2026-08-text-easy.json` (not committed until you choose to).

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
- Prompt image / `IMAGE_GUESS` — later pipeline step

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

---

## 7. Step status (learning track)

| Step | Status |
|------|--------|
| 1. Contract docs + JSON Schema + sample TEXT drafts | done |
| 2. Validate module (Zod / domain) without DB write | done |
| 3. CLI: validate a draft file | done |
| 4. Import script/action → DRAFT only | done |
| 5. Smoke: admin review → publish via existing UI | **ready (you run)** — interrupted Aug 3 by Neon/quiz debug; resume next chat |
| 6. Optional: AI emits same JSON | later |

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

See §9 runbook below. Mark done after you publish at least one imported sample via admin UI.

**Status Aug 3 late:** runbook + `content:smoke-status` ready; Neon/quiz path recovered — **resume smoke in next chat** (do not invent new publish code).

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
