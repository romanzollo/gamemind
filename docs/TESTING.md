# GameMind — Automated Testing Continuity

Local working memory for **learning + adopting automated tests**.
Gitignored continuity file (no secrets). Update as the testing track progresses.

Related: `PROJECT_CONTEXT.md`, `ROADMAP.md` §11.10, `DECISIONS.md` → Automated Testing Adoption.

---

## 0. Status

| Field | Value |
|-------|--------|
| **Status** | `phase-e-done` — GitHub Actions `Test` runs `npm run test` on push/PR to `master` (run #1 **success**) |
| **Last updated** | 2026-07-29 |
| **Learner level** | complete beginner (treat as zero prior testing knowledge) |
| **First target** | Testing A–C+E done; suite **38** unit tests (incl. leaderboard filter parse); next = product (Prompt A) or Phase D Playwright later; keep CI unit-only |
| **Do not** | put Neon smoke hangs into CI; do not rewrite smokes into Vitest without a clear win |

---

## 1. Why test at all? (beginner mental model)

**Without automated tests:** you click through the app (manual smoke). Slow, easy to forget a case, easy to break an old rule while adding a feature.

**With automated tests:** a script runs assertions like “if options are duplicated, return blocker DUPLICATE_OPTION_TEXT”. You run one command; it tells you pass/fail in seconds.

**What we are NOT doing first:** testing the whole website in a fake browser. That is E2E (later). First we test **pure rules** — functions that take data in and return data out, with no Neon, no React, no login.

Analogy:

| Layer | Like… | GameMind example |
|-------|--------|------------------|
| Unit | Checking a recipe step in isolation | quality issues from a fake question object |
| Integration / smoke | Checking oven + ingredients together | `smoke-admin-list.cjs` against Neon |
| E2E | Eating the full meal as a guest | Playwright: login → publish → see blocked |

Manual smoke stays valuable for Neon/Windows quirks. Automation **complements** it; it does not replace judgment.

---

## 2. Adoption plan (phased)

### Phase A — Foundations (learning + Vitest) ← **start here**

**Goal:** understand unit tests; ship first green suite for publish quality.

1. Concepts: what is a test, assertion, arrange-act-assert, pass/fail, why pure functions are easiest.
2. Install Vitest (+ minimal config for TypeScript / path aliases if needed).
3. Add `npm run test` (and optionally `test:watch`).
4. Write first file: tests for `src/features/admin/lib/question-publish-quality.ts`.
5. Cases (minimum):
   - clean question → no issues;
   - duplicate option text → blocker;
   - RU≡EN question → warning;
   - IMAGE_GUESS without prompt → blocker;
   - `hasPublishQualityBlockers` true/false.
6. Learner runs tests locally; reads failure output once on purpose.
7. Commit **app + test config + tests** (not continuity docs).

**Out of scope in Phase A:** Playwright, React Testing Library, mocking Prisma, CI.

### Phase B — Expand unit coverage (still no browser)

**Goal:** protect other pure / nearly-pure rules.

Candidates (pick one at a time):

- `features/quiz/lib/scoring.ts` (weights / max score) ✅;
- admin filter parse (`parseAdminQuestionListFilters`) ✅;
- product follow-up: `parse-bulk-question-ids` ✅ (with bulk isActive, July 28);
- small mappers if they encode real rules.

**Rule:** only code that does not need Neon or a running Next server.

### Phase C — Keep / tidy existing smoke scripts ✅

**Goal:** treat `scripts/smoke-*.cjs` as intentional integration checks for Neon paths.

- [x] Document when to run which smoke (see **§9 Smoke runbook** below).
- [x] Do not rewrite them into Vitest unless there is a clear win.
- [x] Never put admin-list hang reproduction only in CI without a known-good env.

### Phase D — Optional E2E (Playwright)

**Goal:** 1–2 critical flows after unit comfort exists.

Suggested first E2E (later):

- admin: draft with duplicate options → Publish → stays DRAFT + quality blocked;
- or public: login → start quiz → submit (heavier fixtures).

Needs: test user, stable test DB or careful local Neon branch, longer setup.

### Phase E — Optional CI ✅

**Goal:** GitHub Actions runs `npm run test` (unit) on push/PR.

- [x] `.github/workflows/test.yml` — job `Unit (Vitest)`: checkout → Node 20 → `npm ci` → `npm run test`
- [x] No Neon / no secrets / no Playwright in the unit job
- [x] Committed `e68f532`; push to `master`; Actions run #1 **success** (~40–90s)
- Note: GitHub may warn that `actions/checkout@v4` / `setup-node@v4` still target Node 20 runtime — cosmetic; upgrade actions later if desired

Local suite still **29** passed. Do not add Neon smoke to this job.

---

## 3. What to test vs what not to test (MVP discipline)

**Prefer:**

- pure domain rules (quality, scoring);
- Zod schema edge cases that are easy to get wrong;
- regressions you already fixed once (form preserve is UI — harder; quality gate rules are ideal).

**Defer / avoid early:**

- snapshot of every React component;
- testing implementation details of CSS / Taste;
- full Neon matrix in unit tests;
- “100% coverage” as a goal.

**Security / scoring:** unit tests do not replace server-side gates. They lock the *rules* so refactors do not silently weaken them.

---

## 4. Suggested folder layout (Phase A)

```txt
vitest.config.ts          # or vitest.config.mts
src/features/admin/lib/question-publish-quality.ts
src/features/admin/lib/question-publish-quality.test.ts   # co-located — first choice
# OR
# tests/unit/question-publish-quality.test.ts
```

**Recommendation:** co-locate `*.test.ts` next to the module for Phase A (easy to find while learning).

---

## 5. Learning resources (for the human)

Official / practical (English — industry default):

- Vitest guide: https://vitest.dev/guide/
- Vitest assertions: https://vitest.dev/api/expect.html
- Testing Library philosophy (later, for React): https://testing-library.com/docs/guiding-principles
- Playwright (Phase D): https://playwright.dev/docs/intro

Concepts to learn in order:

1. `describe` / `it` / `expect`
2. Arrange → Act → Assert
3. Why failures are useful
4. Watch mode
5. Only then: mocks (`vi.fn`) — not needed for Phase A quality tests

Russian: any short article on «юнит-тесты» + «AAA» is fine as orientation; write assertions and file names in English to match the codebase.

---

## 6. Chat workflow (Prompt V)

Use a **new chat** dedicated to testing education + Phase A implementation.

Constraints for the agent:

- Assume zero testing knowledge; explain terms before using them.
- Small steps: after each step explain → checklist → wait for «дальше».
- AI may write code when user asks («реализуй» / this track’s default: agent implements in small steps with teaching).
- Do not start Playwright or CI in the same chat as “first Vitest install”.
- Do not touch quiz scoring/snapshot Neon hot path “to make it more testable” without explicit ask.
- Update this file + ROADMAP §11.10 checkboxes as phases complete.

Ready-to-paste prompt: see `AGENTS.md` → **Prompt V**, and the copy block in the chat that introduced this file.

---

## 7. Session log

### 2026-07-28 — Product UI: pending spinner (not a testing phase)

- Committed `4702336`: `PendingSpinner` + SubmitButton pending; admin bulk busy lock; more-menu portal
- Testing status unchanged (`phase-e-done`); CI still unit-only
- Next testing optional: Phase D Playwright (dedicated chat)

### 2026-07-28 — Phase E done: GitHub Actions unit CI

- Added `.github/workflows/test.yml` (push + PR → `master`)
- Commit `e68f532` `ci: run Vitest unit tests on push and PR`; pushed
- Actions: workflow **Test**, job **Unit (Vitest)** — run #1 **success**
- Status → `phase-e-done`
- Next testing optional: Phase D Playwright; else product / prod redeploy

### 2026-07-28 — Product: admin bulk isActive (+ unit suite)

- Shipped/committed `137bc4d`: bulk deactivate/reactivate (repo + actions + UI)
- Added `parse-bulk-question-ids.test.ts` (7) — full suite **29** passed
- Status stayed `phase-c-done` at the time (product tests, not a new testing phase)
- Followed same day by Phase E CI (`e68f532`)

### 2026-07-27 — Phase C done: smoke runbook

- Documented `smoke-admin-connect` + `smoke-admin-list` (+ related `db:verify-i18n`)
- Explicit: Vitest ≠ Neon smoke; do not migrate smokes into Vitest / CI yet
- Status → `phase-c-done`
- Next optional: Phase E (`npm run test` in CI) or product; Playwright later

### 2026-07-27 — Phase B done (filters included)

- `parse-admin-question-list-filters.test.ts`: 9 tests
- Full suite: 22 passed (quality 6 + scoring 7 + filters 9)
- Status → `phase-b-done`
- Pending commit: `test(admin): add Vitest suite for question list filters`
- Next: Phase C (document smokes) or product backlog; Playwright/CI later

### 2026-07-27 — Phase B filters step 2: edge + helpers

- Added: array param (first wins), empty string → defaults
- Added: hasActiveAdminQuestionListFilters, buildAdminQuestionListHref
- Next: Phase B filters wrap-up + commit proposal

### 2026-07-27 — Phase B filters step 1: parse basics

- Added `parse-admin-question-list-filters.test.ts`
- Cases: empty → defaults; full valid set; one invalid → all defaults
- Next: array/empty params, hasActive*, buildAdminQuestionListHref
- Status → `phase-b-filters-in-progress`

### 2026-07-27 — Phase B scoring done

- `scoring.test.ts`: 7 tests (weights, max, calculateQuizScore correct/wrong/missing/mix)
- Full suite: 13 passed (quality 6 + scoring 7)
- Status → `phase-b-scoring-done`
- Pending commit: `test(quiz): add Vitest suite for scoring`
- Optional next in Phase B: admin filter parse; or Phase C smoke docs

### 2026-07-27 — Phase B step 2: calculateQuizScore

- Added cases: correct (HARD=3), wrong, missing answer, mix difficulties
- Helper `makeQuestion` for minimal scoring fixtures
- Next: Phase B wrap-up (DoD for scoring module) + commit proposal

### 2026-07-27 — Phase B step 1: scoring weights + max

- Started Phase B with `src/features/quiz/lib/scoring.test.ts`
- Cases: getDifficultyPoints, getMaxPossibleScore (sum + empty)
- Next: calculateQuizScore (correct / wrong / missing / mix)
- Status → `phase-b-in-progress`

### 2026-07-27 — Phase A done

- Restored clean-case assertion after intentional-fail lesson
- Suite: 6 passed (`question-publish-quality.test.ts`)
- Status → `phase-a-done`
- Pending: user commit of app + Vitest (not continuity docs)
- Next track when ready: Phase B (one pure module) or product commit of quality gate if still uncommitted

### 2026-07-27 — Phase A step 4: intentional fail (in progress)

- Temporarily broke clean-case assertion to teach reading failure output
- Restore on next «дальше», then Phase A wrap-up / commit proposal

### 2026-07-27 — Phase A step 3: remaining DoD cases

- Expanded suite: duplicate options, RU≡EN warning, IMAGE_GUESS no image, hasPublishQualityBlockers true/false
- Next: intentional fail lesson (step 4), then Phase A wrap-up / commit proposal

### 2026-07-27 — Phase A step 2: first unit test

- Added `src/features/admin/lib/question-publish-quality.test.ts`
- First case: clean question → `[]`
- Helper `makeCleanQuestion` for later negative cases
- Next: more cases (duplicate, RU≡EN, IMAGE_GUESS, blockers)

### 2026-07-27 — Phase A step 1: Vitest install

- Installed `vitest@3.2.4` (devDependency) — not v4: Node here is 20.11.1; Vitest 4/Vite 8 need ≥20.19
- Added `vitest.config.ts` (node env, `@/` alias, `src/**/*.test.ts`, `passWithNoTests`)
- Added scripts: `npm run test` (= `vitest run`), `npm run test:watch`
- Status → `phase-a-in-progress`
- Next: first test file for publish quality (step 2+)

### 2026-07-27 — Plan + Prompt V prepared

- Status → `planned`
- ADR in DECISIONS; ROADMAP §11.10; PROJECT_CONTEXT Next step points here
- Vitest not installed yet — start in a new chat with Prompt V
- Prerequisite product work: commit publish quality gate when user ready (tests target that code)

---

## 8. Definition of done — Phase A

- [x] Vitest installed and configured
- [x] `npm run test` exits 0 with quality suite
- [x] Learner can explain: unit vs E2E, why pure function first, what `expect` does
- [x] Learner can add one new test case with light mentoring
- [x] Continuity: this file Status → `phase-a-done`; ROADMAP §11.10 Phase A checked
- [x] App commit includes tests (continuity docs stay gitignored)

---

## 9. Smoke runbook (Phase C)

**Unit (`npm run test`)** = правила в памяти, без сети.  
**Smoke** = реальный запрос к Neon из Node-скрипта (нужен `.env` / `.env.local`).

Не путать: зелёный Vitest **не** доказывает, что admin list на Windows+Neon не зависнет.

### Каталог

| Script | Команда | Когда гонять | Что смотреть |
|--------|---------|--------------|--------------|
| `scripts/smoke-admin-connect.cjs` | `node scripts/smoke-admin-connect.cjs` | Подозрение на connect / pooler / `SET statement_timeout` | Логи connect ms, SET ok/fail, простой `COUNT(*)` |
| `scripts/smoke-admin-list.cjs` | `node scripts/smoke-admin-list.cjs` | Admin `/questions` тормозит или timeout ~24s | Latency того же SQL-семейства, что list query |
| Related (не `smoke-*`) | `npm run db:verify-i18n` | После seed / i18n правок контента | RU/EN целостность текстов |

### Правила

1. Нужны валидные DB URL в env (скрипты сами читают `.env` / `.env.local`).
2. Гонять **локально**, когда есть симптом Neon/admin-list — не как ежедневный «весь suite».
3. **Не** переносить эти smokes в GitHub Actions, пока нет стабильного known-good env (флаки убьют доверие к CI).
4. **Не** переписывать в Vitest «просто так»: там нужен живой Postgres; unit-слой уже закрывает pure rules.
5. После серии таймаутов admin list: сначала `npm run dev` restart, потом smoke-connect → smoke-list (как в PROJECT_CONTEXT Do not regress).

### Быстрый выбор

- Менял pure rule (quality / scoring / filters)? → `npm run test`
- Админка «висит» на списке / connect? → smoke-connect, затем smoke-list
- Кликнул Publish / UI flow? → ручной browser smoke (пока без Playwright)

