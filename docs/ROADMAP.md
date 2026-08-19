# GameMind Local Roadmap

This file is gitignored local working documentation.

## MVP Order → Public Beta growth

**Current stage (July 26, 2026): `public beta`.** Core product is live and usable. Treat next work as **product growth after beta**, not “finish the MVP first”. Historical checklist below stays for continuity.

### 1. Project Foundation

- [x] Next.js App Router project
- [x] TypeScript setup
- [x] Prisma setup
- [x] Neon connection
- [x] Feature-based folder structure

### 2. Authentication

- [x] User model with `role`
- [x] Register validation
- [x] Password hashing with bcryptjs
- [x] Register Server Action
- [x] Credentials provider
- [x] Login Server Action
- [x] JWT session with `id`, `username`, `role`
- [x] Auth.js type augmentation
- [x] Profile route protection
- [x] Logout
- [x] Admin guard in proxy
- [x] Server-side `requireUser()` and `requireAdmin()`
- [x] DB-authoritative `requireUser()` / `requireAdmin()` checks for current `isActive` and `role` (JWT may be stale after admin actions)

### 3. Questions Seed

- [x] Create starter manually reviewed video game questions
- [x] Seed `Question` and `AnswerOption`
- [x] Verify each question has exactly one correct answer
- [x] Run `npm run db:seed`
- [x] Inspect seeded data in Prisma Studio

### 4. Theme And I18n Foundation

- [x] Add light/dark theme with CSS variables
- [x] Add theme toggle
- [x] Add `ru` and `en` dictionaries
- [x] Move pages under `/[locale]`
- [x] Add language switcher
- [x] Make auth/protected redirects locale-aware
- [x] **Question and answer text per locale** (full app i18n — see section 8)

### 5. Quiz Flow

- [x] Quiz setup page with difficulty and question count
- [x] Server Action to create a `QuizSession`
- [x] Select active questions by difficulty
- [x] Display quiz session page
- [x] Submit answers through server-side logic
- [x] Save `QuizAnswer`
- [x] Calculate score on the server
- [x] Save `QuizResult`
- [x] Show result page
- [x] Improve submit validation UX with `useActionState`
- [x] Randomly select questions from the active pool instead of deterministic `createdAt` order
- [x] Persist exact session question ids at quiz creation time
- [x] Persist per-session option display order (shuffle once at session start; anti-cheat)
- [x] Make quiz page read from session snapshot
- [x] Make `submitQuizAction` scoring read from the same session snapshot
- [x] Question bank: 60 bilingual seed questions (`scripts/seed-questions.cjs`, 20 per difficulty)
- [x] Remove legacy `quizSessionRepository.create()` and unused pool read helpers in `question.repository.ts`
- [x] Stabilize quiz start on Neon with `QuizSession.snapshotData` JSONB (`20260706132000_quiz_session_json_snapshot`): direct `pg` read for pick/translation + one pooled `pg` insert for the frozen snapshot
- [ ] Harden all read repositories with `withDatabaseRetry` consistently

### 6. Leaderboard

- [x] Query best score per user (`findBestScores`)
- [x] Sort by score descending and completion time ascending
- [x] Render leaderboard page with table and empty state
- [x] i18n labels for leaderboard columns
- [x] Optimize `findBestScores`: SQL `DISTINCT ON` via unpooled direct `pg` (July 16 evening; was Prisma hang class)
- [x] Column cleanup + Scoreboard UI (July 26): Место | Игрок | Очки | Точность | Дата; phone strip + sm+ table; podium medals 1–3
- [x] Difficulty filter on `/leaderboard` (`?difficulty=`; JOIN `QuizSession`; July 29; committed `14dc97c`)
- [x] Period filter on `/leaderboard` (`?period=week|month`; rolling 7/30d on `QuizResult.completedAt`; July 29; committed `019c071`; on prod)
- [x] Retention Layer 1 (Aug 19): default rolling week; exclusive Classic/Blitz/Daily boards; Blitz tie-break by duration; 7-day copy on board + Classic/Blitz lobby
- [ ] Later: category leaderboards (product, not presentation; needs taxonomy)

### 7. Admin Panel

- [x] List questions
- [x] Create questions
- [x] Delete questions (hard delete; cascade to options/quiz answers)
- [x] Protect create/delete actions with `requireAdmin()`
- [x] Edit questions
- [x] Deactivate/archive questions (`isActive = false`) — soft hide from quiz pool
- [x] Reactivate questions (`isActive = true`) — restore to quiz pool
- [x] Idempotent deactivate/activate (no-op if already in target state)
- [x] Admin forms: question + option text for `ru` and `en`
- [x] Harden admin list against multi-minute Neon hangs (unpooled read + ~30s hard timeouts + `loading.tsx`; avoid tight pooled 12s budget)
- [x] Move admin deactivate/activate/delete off Prisma `$transaction` to direct `pg`
- [x] Verify admin list loads again after `loadFailed` regression fix
- [x] Filters: status, difficulty, type (URL + SQL; category filter later if needed)
- [x] Search by question text (ru+en translations + legacy)
- [x] Admin questions responsive list UI (cards `<lg`, table `lg+`, IMAGE hero preview)
- [x] July 24: admin list hang/Reset playbook — simple SQL, serialized unpooled Client + 300ms settle, hard nav, thumbs 2nd-connect/cache, dev keep-warm (see `PROJECT_CONTEXT` + ADR)
- [x] July 26: unfiltered list hang after `publicationStatus` — **not** `WHERE true` / **not** `UNION ALL`; use **3 sequential** SELECTs by difficulty + 60s list TTL cache (invalidate on mutations)
- [x] July 26 night: admin list locale text fixed without second read — main list SELECT uses EN scalar subquery (`QuestionTranslation(en)` → `Question.text`); cache key includes locale. **Do not** restore queued translation overlay / JOIN / second query for list text.
- [x] Admin home counts on `/:locale/admin` (July 25) — one COUNT SQL; graceful fallback
- [x] Admin hub Questions 2×2 format glance (Aug 18) — TEXT/IMAGE_GUESS `COUNT(*)` in the same SELECT; Users **Всего** / **Total**; user smoke OK
- [ ] Follow-up (hang debt): restore `optionsCount` without JOIN/`ANY` hang
- [ ] Follow-up (hang debt): revisit soft RSC / drop settle delay if Linux+prod stays healthy
- [ ] Follow-up (hang debt): single-query or denormalized prompt URL for thumbs
- [ ] Optional retry control when list `loadFailed`
- [x] Draft/review/published — schema + quiz pool filter + admin repo transitions (July 26 eve; local migration)
- [x] Draft/review/published — list Server Actions + badges/actions + i18n (July 26 night)
- [x] Draft/review/published — edit-page workflow controls + URL filter by `publicationStatus` (July 26 late)
- [x] Admin questions actions polish: primary row action + “more” menu (desktop) (July 27)
- [x] Draft/review/published — **prod** migration `20260726160000_question_publication_status` + smoke OK (July 27)
- [x] Bulk actions for deactivate/reactivate (July 28: committed `137bc4d`; repo + actions + checkboxes/toolbar; user smoke OK)
- [x] Bulk actions for submit-for-review / publish (July 29: local; quality gate + contextual toolbar; user smoke OK)
- [x] Duplicate/quality warnings before publishing (July 27: pure checks + edit panel + server gate; controlled form preserve on error; local smoke OK)

### 8. Question Content I18n (Full App Language)

Goal: `/en` quiz shows English questions/answers; `/ru` shows Russian — not only localized UI.

- [x] Add `QuestionTranslation` and `AnswerOptionTranslation` (relational tables; not JSONB interim)
- [x] Migrate seed data to `ru` translations + add `en` translations
- [x] Quiz repositories accept `locale` and return translated `text` (snapshot stores resolved `displayText`)
- [x] Admin create/edit: per-locale fields for question and all options
- [x] Admin list: display text for current page locale
  - **Note (July 24 hang mitigation):** list temporarily uses legacy `Question.text` (no translation JOIN). Restore locale resolution is ROADMAP §7 follow-up hang debt.
- [x] Session snapshot: `sessionLocale` + `displayText` on `QuizSessionQuestion` / `QuizSessionQuestionOption`
- [ ] Optional cleanup: deprecate legacy `Question.text` / `AnswerOption.text` columns after all write paths use translations only

### 9. Later Expansion

- [x] Achievements (MVP shipped)
- [x] User statistics (profile summary)
- [x] Daily challenges (MVP shipped)
- [ ] Question tags/categories/platforms/genres (deferred until filter demand)
- [ ] API-assisted draft question generation — pipeline ready (emit same `version: 1` JSON); product/IGDB later
- [x] Admin review workflow for drafts (publicationStatus + quality gate; July 26–29)
- [x] Content scale: draft JSON → validate → import DRAFT → admin publish + AI batches on prod (**done** Aug 4)

### 10. Question Media And Visual Questions

Goal: quiz cards with images — guess game / level / character from screenshot; optional illustration on text questions.

**Prerequisite:** Phase 1 snapshot + Phase 2 i18n + stable text question bank (done).

**Performance prerequisite (done before schema + images):**

- [x] Migrate display text resolution from Prisma to **one direct `pg` query** (`pickRandomActiveSnapshotBundle`, `DATABASE_URL_UNPOOLED`)
- [x] Measure and fix `startQuizAction`: query work is fast, but awaiting `pg client.end()` caused ~19s response delays; `client.end()` is now fire-and-forget
- [x] Avoid relational snapshot writes on quiz start; store frozen JSONB snapshot in `QuizSession.snapshotData`

**Recommended order:**

- [x] Phase 4 (partial): design tokens + `QuestionCard` + quiz session layout/progress
- [x] Schema: `QuestionType` enum (`TEXT`, `IMAGE_GUESS`); `QuestionAsset` model
- [x] Snapshot: `imageUrl` in JSON snapshot (`snapshotData.questions[]`); relational `displayImageUrl` on `QuizSessionQuestion`
- [x] Extend **same** direct `pg` display resolver with prompt `QuestionAsset` subquery — **no extra Prisma query**
- [x] Extend JSON snapshot mapping and `loadSnapshotPublicQuestions` to return `imageUrl` from frozen snapshot only
- [x] DTO: `QuizPublicQuestion.imageUrl`; wired through `QuizSessionForm` → `QuestionCard`
- [x] UI: `QuestionCard` + `QuestionImage` — native `<img>` full-frame (not cropped 16:9); theme frame; SVG→WebP URL normalize for old snapshots
- [x] Storage MVP: `public/quiz-images/` + optimize pipeline (`images:optimize`, trim/inside/pixel-art)
- [x] Guide + optimize pipeline: `docs/QUIZ_IMAGES.md`
- [x] Replace SVG placeholders with real WebP screenshots; `npm run images:update-db`
- [x] Admin: type selector + prompt image URL; bulk direct `pg` edit extended for `type` + asset upsert/delete
- [x] Seed: 9 `IMAGE_GUESS` showcase questions (3 per difficulty)
- [x] Verify script: active `IMAGE_GUESS` must have PROMPT asset
- [x] Production storage adapter (RU-first): Vercel Blob primary + `/media` rewrite; `local-public` for local; sharp at upload (July 23)
- [x] Admin: file upload + URL advanced; `QuestionAsset` storageKey/meta
- [x] Avatar Phase B: file upload → `/media/avatars/...` (local + **prod** verified July 23)
- [x] Prod: Blob env on Vercel (`BLOB_READ_WRITE_TOKEN` + `BLOB_PUBLIC_BASE_URL`) + redeploy
- [x] Prod fix: sharp/Blob `SharedArrayBuffer is not allowed` → owned `ArrayBuffer`/`Buffer.alloc` + `serverExternalPackages`
- [x] Prod RU smoke: avatar upload/clear; `/media` delivery; admin IMAGE_GUESS upload; seed `/quiz-images`; quiz session — **OK July 23 evening**
- [ ] Later: `IMAGE_OPTIONS`, `AUDIO_GUESS`, press/legally cleared assets, IGDB drafts; Yandex S3 provider; Taste upload UI

**Do not:**

- Store blobs in Postgres; hotlink unstable external URLs; `metadata.imageUrl` only without relational model; skip snapshot freeze
- Add Prisma reads for assets on quiz start or quiz page
- Nest `withDatabaseRetry` around direct `pg` quiz paths
- Process/upload images inside `startQuizAction`
- Load full screenshots in admin list SSR for every row
- Default to Cloudflare R2 for RU-first audience (see DECISIONS Media Storage ADR)

## Immediate Next Step

**Last updated:** August 19, 2026 — Survival Mode MVP **contract** locked (ADR + `types.ts`). Leaderboard Layer 1 still **local** (user smoke OK). TEXT pool **378** (126/126/126).

**Preferred next:** Survival **chat A** = Prisma `SurvivalRun` + session discriminator + Classic/achievements WHERE `survivalRunId IS NULL` (**before** any Survival result). Do **not** start `runSurvivalQuizStart` in that chat. In parallel / separately: commit Layer 1 when asked → redeploy + smoke `/leaderboard` week default on www. Then optional mechanics TEXT **wave 6** ×24 — **new loops only**; stems `QUESTION_I18N.md` §10; distractors **§3 D**. Mix lobby is live — do not re-implement. Always `migrate deploy` on **prod** after schema deploys (`CONTENT_PIPELINE.md` §10; Windows `P1002` → SQL + `_prisma_migrations`). Do **not** re-import C/D/fresh/samples/mechanics-12/w2-24/w3-24/w4-24/w5-24 (TEXT = new UUIDs). Published stem fixes = UPDATE (`voice-pass-mechanics-stems.cjs`), never import. No keep-warm / no timeout bumps / no JSONB on submit complete / no cycle on Prisma or Direct queue. Do not merge Survival into Timed.

1. ~~Finish Phase 1 cleanup~~ — done.
2. ~~Question bank (60 seed, 9 IMAGE_GUESS)~~ — done.
3. ~~UI/UX polish (quiz session)~~ — done (functional; brand pass = §11.8; smooth interaction = §11.9).
4. ~~Question media MVP (§10)~~ — done.
5. ~~**Real WebP screenshots + display fix**~~ — done.
6. ~~Role-aware header nav (guest / user / admin)~~ — done.
7. ~~Admin list hang + `loadFailed` regression~~ — done (July 14); ~~harden abort/IPv4/12s budget~~ — done (July 18).
8. ~~**First public deploy**~~ — Vercel + prod Neon + seed + domain `game-mind.ru` / `www` — done.
9. ~~**Epic 1 auto sign-in + confirmPassword**~~ — done (`7f6246b`).
10. ~~**Epic 2 result answer review (§11.2)**~~ — done; on prod; quiz at `/:locale/quiz`.
11. ~~**Epic 3 weighted scoring (§11.3)**~~ — done; on prod (user-verified).
12. ~~**Epic 4 profile (§11.4)**~~ — on prod; Avatar Phase B **upload on prod** July 23; **stats MVP** July 29 (committed `44b860e`).
13. ~~**Epic 5 admin users (§11.5)**~~ — on prod (July 18): users CRUD + `isActive` + hub `/admin` + Neon harden.
14. ~~**§11.9 light Perceived performance**~~ — done July 18 night; empty/alerts + reduced-motion in Taste Tasks 8–9.
15. ~~**§11.8 Taste Wave A + Wave B**~~ — on prod (2026-07-22 smoke OK); Status = `ongoing`.
16. ~~**Media storage + admin/avatar upload (RU-first)**~~ — local + Blob env on prod July 23 (not R2).
17. ~~**Finish media RU smoke**~~ — done July 23 evening (user-verified).
18. ~~**Admin QoL filters/search + responsive list**~~ — done July 23 night (local; redeploy when ready).
19. ~~**Architecture/security audit must-fix**~~ — DB-authoritative guards; localized auth errors; profile Server Action imports direct (July 25).
20. ~~**Rate limiting (§11.6)**~~ — in-memory fixed-window for auth / password / avatar / admin upload / quiz start+submit (July 25 evening).
21. ~~**Admin home counts (§11.5)**~~ — hub aggregates + Scoreboard polish (July 25 night, user-verified; on origin).
22. ~~**Admin user support detail (§11.5)**~~ — `/:locale/admin/users/[id]` read-only history + users list responsive cards (July 25 late, user-verified).
23. ~~**Leaderboard column cleanup + Scoreboard UI (§11.6)**~~ — points/accuracy/date; phone strip + sm+ table; podium medals (July 26, user-verified; committed).
24. ~~**§11.7 question.repository split**~~ — types + quiz-pick + admin + facade (July 26; committed `6c663e6`; smoke OK).
25. ~~**Admin draft/review/publish**~~ — schema+repo+UI + **prod migration + smoke OK** July 27.
26. ~~**§11.7 quiz-session.repository split**~~ — types + snapshot + start + submit + reads + facade (July 27; committed `34a00d2`; optional browser smoke).
27. ~~**Publish quality warnings + gate**~~ — committed `dfd57b1` (+ Vitest quality suite).
28. ~~**Admin bulk deactivate/reactivate**~~ — committed `137bc4d` (July 28; user smoke OK).
29. ~~**Testing Phase E (CI)**~~ — `.github/workflows/test.yml`; committed `e68f532`; Actions **Test** run #1 success.
30. ~~**Pending UX (spinner + more menu portal)**~~ — committed `4702336` (July 28).
31. ~~**Profile stats (summary on /profile)**~~ — committed `44b860e` (July 29).
32. ~~**Leaderboard difficulty filter (§6)**~~ — committed `14dc97c` (July 29).
33. ~~**Admin bulk publication + contextual toolbar**~~ — committed `6f26abf`; on prod.
34. ~~**Leaderboard period filter**~~ — committed `019c071`; on prod.
35. ~~**Daily Challenge MVP**~~ — schema+start+CTA+board on prod July 30 (migration + user smoke OK). Commits `01e4dbe`…`34d2a59` (+ chore `dcb2653`).
36. ~~**Achievements MVP**~~ — on prod July 30 (schema+award+profile UI; migration smoke OK).
37. ~~**Toast Notifications MVP**~~ — shipped July 30 (Sonner + unlock flash + profile/admin reuse + scroll-preserving mutations).
38. ~~**Achievements catalog v2**~~ — `QUIZZES_10` + `MEDIUM_QUIZ` (types → evaluate/tests → SQL `has_medium` → i18n → illustrations); committed `06aeae2` July 31; no schema migration.
39. ~~**Achievements criteria progress (profile)**~~ — locked tiles show server `current/target`; committed `8f600fb` July 31; Vitest 93.
40. ~~**IMAGE_GUESS batch ×90 + lightbox**~~ — Aug 6 import; Aug 12 verified PUBLISHED local+prod; lightbox UX + §6 smoke checklist.
41. ~~**UserQuestionCycle (seeded cursor)**~~ — Aug 12: pooled raw `pg` outside Direct queue (`a84ebdb`); reshuffle-first (`382f795`); int32 clamp (`359ff61`).
42. ~~**Content bank sync + ops tooling**~~ — Aug 12: smoke IMAGE/TEXT; publish-text-drafts CLI; TEXT D1 + C1–C3 local catch-up; banks TEXT 270 / IMAGE 171.
43. ~~**Mechanics TEXT wave ×12**~~ — Aug 13: `2026-08-12-text-mechanics-12.json` validate → DRAFT → publish gate local+prod; TEXT pool **282** (94/94/94).
44. ~~**Mechanics TEXT wave 2 ×24**~~ — Aug 13 later: `2026-08-13-text-mechanics-w2-24.json` (8×EASY/MEDIUM/HARD); TEXT pool **306** (102/102/102) local+prod.
45. ~~**Mechanics TEXT wave 3 ×24**~~ — Aug 13 evening: `2026-08-13-text-mechanics-w3-24.json` (8×EASY/MEDIUM/HARD); TEXT pool **330** (110/110/110) local+prod.
46. ~~**Friends prod smoke (incl. IMAGE_GUESS)**~~ — Aug 13: user report — friends play TEXT+images, lightbox OK, set records, use leaderboard.
47. ~~**Mixed-difficulty on prod (`poolKind`)**~~ — Aug 15: migration `20260813220000_quiz_session_pool_kind` on prod Neon; www Classic EASY 3 / MIX + Blitz EASY / MIX start→score (user-verified). Ops: `CONTENT_PIPELINE.md` §10.
48. ~~**Mechanics TEXT wave 4 ×24**~~ — Aug 18: `2026-08-17-text-mechanics-w4-24.json` (8×EASY/MEDIUM/HARD); TEXT pool **354** (118/118/118) local+prod.
49. ~~**Mechanics stem voice-pass (12 / w2 / w3)**~~ — Aug 18 evening: in-place `UPDATE` local+prod (`scripts/voice-pass-mechanics-stems.cjs`); same 60 UUIDs; pool still **354**. Canon: `QUESTION_I18N.md` §10.
50. ~~**Mechanics TEXT wave 5 ×24**~~ — Aug 18 night: `2026-08-18-text-mechanics-w5-24.json` (8×EASY/MEDIUM/HARD); TEXT pool **378** (126/126/126) local+prod. Distractors: `QUESTION_I18N.md` §3 D.
51. ~~**Admin hub format glance**~~ — Aug 18: Questions 2×2 (`Question.type` TEXT/IMAGE_GUESS) + Users total caption; same COUNT round-trip; user smoke OK.
52. ~~**Leaderboard retention Layer 1**~~ — Aug 19: default rolling week; exclusive Classic/Blitz/Daily; Blitz duration tie-break; 7-day copy on board + Classic/Blitz lobby; **local user smoke OK**; www deploy pending.
53. ~~**Survival Mode MVP contract**~~ — Aug 19: ADR + `src/features/survival-mode/types.ts` (time-bank waves, not instant-death). Schema / start / submit **not** started.

### Deploy / hosting checklist (tracking)

- [x] Production Neon project + migrate + seed
- [x] Vercel project connected to GitHub; env vars set
- [x] First successful production deploy (`*.vercel.app`)
- [x] Custom domain attached (`game-mind.ru` → www; REG.RU DNS)
- [x] `AUTH_URL` points at HTTPS domain (keep in sync with primary host)
- [x] Friends smoke-test checklist fully signed off (incl. IMAGE_GUESS + register as non-admin) — Aug 13 user report: quiz + images/lightbox + leaderboard records
- [ ] Rotate prod ADMIN password if it was ever shared outside a password manager

## Post-MVP Professional Roadmap

### Phase 1 — Stable, Varied Quiz Core

- [x] Add `QuizSessionQuestion` with session id, question id, and question position
- [x] Add `QuizSessionQuestionOption` with option id and display order
- [x] Update `startQuizAction` to select random active questions and persist the snapshot
- [x] Update quiz page reads to use session snapshot
- [x] Snapshot write via raw `pg` + `DATABASE_URL_UNPOOLED` (Neon/Prisma workaround — see `DECISIONS.md`)
- [x] Update `submitQuizAction` scoring to use session snapshot
- [x] Ensure refresh does not change questions or option order (quiz page)
- [ ] Add manual verification for repeated sessions, refresh, incomplete answers, and completed sessions

### Phase 2 — Full Content I18n

- [x] Add translation tables for questions and options
- [x] Migrate existing text into `ru`
- [x] Add `en` translations to seed/admin content
- [x] Update admin create/edit forms for both locales
- [x] Update quiz reads to display content by route locale
- [x] Snapshot stores `sessionLocale` + resolved `displayText`
- [ ] Optional: remove legacy `Question.text` / `AnswerOption.text` cache columns

### Phase 3 — Question Bank And Admin Quality

- [x] Add at least 30-50 manually reviewed questions before public demo (60 seed questions)
- [ ] Add tags/categories/platforms/genres only when needed by real quiz filters
- [x] Add admin filters and search (July 23)
- [x] Add draft/review/publish status — schema + quiz pool + admin repo + list/edit UI + URL filter (July 26) + **prod** migration + smoke (July 27)
- [x] Quality warnings/blockers before publish (July 27 — committed `dfd57b1`) — `getQuestionPublishQualityIssues` + edit panel + gate on publish/submit-for-review
- [x] Prefer archive/deactivate for real content; keep hard delete for cleanup/admin-only cases
- [x] Bulk actions for deactivate/reactivate (July 28 — committed `137bc4d`)
- [x] Bulk actions for submit-for-review / publish + contextual toolbar (July 29 — local; quality gate; user smoke OK)

### Phase 3.5 — Question Media (Visual Questions)

- [x] **Prerequisite:** direct `pg` for display text resolver (remove Prisma from quiz start)
- [x] **Prerequisite:** fast quiz start snapshot via `QuizSession.snapshotData` JSONB
- [x] `QuestionType` + `QuestionAsset` schema
- [x] Snapshot image URL in `snapshotData` + extend direct `pg` resolver (text + image URL in one query)
- [x] `QuestionCard` UI with image prompt (`next/image`, static URLs)
- [x] Admin: type + prompt image URL (bulk direct `pg` on edit); file upload **local July 23** (RU-first storage)
- [x] Image-guess seed subset (9 questions) + verify script
- [x] Storage adapter + sharp upload (Vercel Blob / local-public; `/media`); prod Blob env + avatar upload OK July 23

### Phase 4 — UI/UX And Visual Identity

- [x] Design tokens extended (`success`, `warning` in `globals.css`)
- [x] Quiz session: `QuestionCard`, progress bar, sticky submit, `QuestionImage`
- [x] Quiz setup/session page layout aligned
- [x] Role-aware site header (guest / user / admin nav + logout in header)
- [x] Result page answer review (Epic 2) — further visual polish optional
- [x] Admin hub at `/:locale/admin` (Questions / Users entry) — July 18
- [x] Partial route `loading.tsx` (admin hub / questions / users / edit)
- [x] **§11.9 light pass** (July 18): shared `PageSkeleton` / `SubmitButton` / `PendingLink`; route loaders for public + profile; form pending on auth/quiz/profile/admin
- [x] Polish leaderboard table/list (Scoreboard Editorial, July 26)
- [x] Add consistent empty/error visual polish (**Taste Tasks 8** — InlineAlert / EmptyState; denser admin optional)
- [x] Improve keyboard focus states and accessibility basics (**Taste Task 9**)
- [ ] **§11.9 remainder** (top progress bar, dynamic imports, intentional enter motion) — optional later
- [x] **§11.8 Taste Skill Wave A + Wave B** — on prod (2026-07-22 smoke OK); Status = `ongoing` (`TASTE_SKILL.md`)

### Phase 5 — Rich Product Features

- [x] Profile with result history (Epic 4 **on prod**; **stats MVP** July 29 `44b860e`)
- [x] Achievements — **MVP on prod** July 30 (schema+award+profile UI/illustrations; migration smoke OK)
- [x] Achievements catalog v2 — `QUIZZES_10` + `MEDIUM_QUIZ` July 31 (`06aeae2`); 7 codes; additive only (no migration)
- [x] Achievements criteria progress on profile — locked `current/target` July 31 (`8f600fb`); server metrics only
- [x] Toast notifications (Sonner + achievement flash) — **shipped** July 30; see DECISIONS “How to add a new toast”
- [x] Daily challenge — **MVP on prod** July 30 (Moscow day, freeze, one attempt, CTA home+quiz, today’s board; migration `20260729234500_daily_challenge`)
- [x] Timed mode — **on origin** July 31; **abandon + rematch + review Neon harden + RU labels** Aug 2 (local verified; redeploy pending)
- [ ] Survival/streak mode — **ADR + `types.ts` locked Aug 19** (time-bank waves, not instant-death). Next chat: schema + Layer 1/achievements `survivalRunId IS NULL`. No start runner yet.
- [ ] Category/platform/genre-specific quiz — defer until real filter demand + more tagged content
- [x] Period-based leaderboards (difficulty `14dc97c` + rolling week/month `019c071`; Layer 1 default week + mode + Blitz speed Aug 19)
- [ ] API-assisted draft question generation with admin review
### Phase 11 — Post-Launch UX Slice (active)

See `PROJECT_CONTEXT.md` → **Next Product Slice** and `DECISIONS.md` → **Post-Launch UX Slice**.

#### 11.1 Auth friction

- [x] Register: `confirmPassword` field + Zod refine (passwords must match)
- [x] After successful register: `signIn('credentials')` → redirect to `/${locale}` (home), already authenticated
- [x] Register success UI: remove dead-end “please log in again” as the only path
- [x] Verify on prod: new user sees USER nav without second password entry — friends registered and play as non-admin (Aug 13)

#### 11.2 Result answer review

- [x] Load snapshot + `QuizAnswer` on result page (owner only)
- [x] Summary card kept (score / correct / total)
- [x] Per-question review: your answer vs correct; highlight wrong; optional “wrong only” filter
- [x] IMAGE_GUESS: show snapshot thumbnail in review row
- [x] i18n strings for review labels (ru/en)
- [x] CTAs: play again / leaderboard / home
- [x] Quiz setup route: `/:locale/quiz` (replace `/quiz/setup` conflict)

#### 11.3 Weighted scoring

- [x] Define weights in `scoring.ts`: EASY=1, MEDIUM=2, HARD=3
- [x] Ensure snapshot (or session) exposes difficulty per question for scoring
- [x] `score` = sum of weights for correct; keep `correctCount` separate
- [x] Result + leaderboard UI copy: points vs correct count
- [x] Do not rewrite historical `QuizResult` rows unless explicitly planned
- [x] Mixed-difficulty quiz mode (`poolKind` SINGLE/MIXED; Mix ≠ `Question.difficulty`) — on www Aug 15 after prod schema catch-up; user-verified Classic/Blitz MIX start→score

#### 11.4 Profile & account

- [x] Change password (current + new + confirm); Server Action + Zod + bcrypt
- [x] Change username (unique; JWT `unstable_update` + `router.refresh`)
- [x] Avatar interim: URL in `User.image`; Zod + direct `pg` `updateImage`; profile form + clear
- [x] Show avatar in header + profile (`UserAvatar`, `object-cover`)
- [x] JWT/login: `picture`/`image` on authorize + `auth.config` update trigger
- [x] Result history list (last N results with links)
- [x] Move profile history + password (+ leaderboard) off Prisma hang class to direct `pg`
- [x] **Avatar Phase B:** file upload + sharp square crop + WebP via RU-first storage (`/media/avatars/...`); **prod upload verified** July 23 (SharedArrayBuffer fix; not R2)
- [x] **Profile stats MVP** (July 29): `findStatsByUserId` + Scoreboard summary on `/profile` (played / best / accuracy / last played); empty → nulls not fake zeros
- [ ] Later: richer stats, bio, email change with verify, OAuth

#### 11.5 Admin users & ops

- [x] `/:locale/admin/users` list (no passwordHash)
- [x] Delete user with confirm; cannot delete self; cannot delete last ADMIN
- [x] Change role USER ↔ ADMIN (same guards)
- [x] Soft disable: `User.isActive` blocking login (migration on local + prod Neon)
- [x] Existing JWT sessions re-check current DB `isActive` / `role` in `requireUser()` / `requireAdmin()` (July 25)
- [x] Admin hub `/:locale/admin` + header Admin → hub (July 18)
- [x] Neon admin-read harden: sync destroy on timeout, IPv4, 12s×2, retry link
- [x] Admin home counts (users / questions active·inactive / sessions today UTC) + Scoreboard hub polish (July 25)
- [x] Admin hub TEXT/IMAGE_GUESS glance on Questions card (Aug 18; same COUNT round-trip; Users **Всего**)
- [x] Admin user detail `/:locale/admin/users/[id]` — read-only profile + recent QuizResult; history UI = ProfileResultHistory pattern (no Обзор); users list = questions cards/`nowrap` sticky actions (July 25)
- [ ] Later: **admin session answer review** (owner OR admin; snapshot read-only; entry from user detail) — see DECISIONS; trigger = real support disputes; prefer after commit of user detail, ideally after/near §11.7 session split
- [ ] Later: audit log, impersonation (avoid), bulk ban

#### 11.6 Follow-ups (after 11.1–11.5)

- [x] Rate limit auth + password change (+ avatar, admin upload, quiz start/submit) — in-memory MVP July 25
- [x] Admin question filters/search
- [x] Shared storage for quiz assets + avatars (RU-first Blob + `/media`; local July 23) — prod env + RU smoke pending
- [x] Leaderboard column cleanup (points + accuracy + date) + Scoreboard presentation + podium medals (July 26)
- [ ] Accessibility / empty states on new pages (functional; full visual system = §11.8 + §11.9)
- [ ] Optional avatar crop UI (zoom/pan) after upload baseline on prod
- [ ] **§11.9 Perceived performance** remainder (top progress bar / dynamic imports) — light pass done
- [ ] Later: Redis/Upstash rate limit if multi-instance abuse becomes real

#### 11.8 Taste Skill — visual identity & ongoing UI discipline

**When (foundation):** after **11.1–11.5 are live on prod**, **before** Phase 5 quiz modes. Separate from §11.7.

**Ongoing (forever after foundation):** every new feature UI extends the locked design system (`docs/TASTE_SKILL.md` Prompt T-Feature + §7 change log). Project skill: `.cursor/skills/gamemind-taste-ui`.

**Source of truth for UI track:** `docs/TASTE_SKILL.md` (analysis, brief, lock, waves, prompts, changelog). Decision: `DECISIONS.md` → Taste Skill Visual Identity. Site: [tasteskill.dev](https://www.tasteskill.dev/).

**Setup**

- [x] Install `redesign-existing-projects` + `design-taste-frontend` (July 18 → `.agents/skills/`)
- [ ] Optional: one style overlay + optional imagegen/brandkit
- [x] Confirm `gamemind-taste-ui` skill + `docs/TASTE_SKILL.md` in continuity habit

**Foundation execution**

- [x] Prompt T-Audit → paste into `TASTE_SKILL.md` §6 (2026-07-21)
- [x] UI/UX strategy canon (§13) + incremental backlog (§14)
- [x] Lock design system §4 **in code** (Task 1: tokens/fonts in `globals.css` + `@fontsource`)
- [x] Wave A — public flows per §14 Tasks 1–9 (local; user-verified Task 9)
- [x] Wave A — redeploy + smoke on `www.game-mind.ru` (2026-07-21 evening — user-verified)
- [x] Wave B — Profile (2026-07-21)
- [x] Wave B — admin questions (2026-07-21)
- [x] Wave B — admin users (2026-07-21)
- [x] Wave B — a11y / active nav highlight (2026-07-21)
- [x] Wave B — Profile history mobile overflow (2026-07-21)
- [x] Wave B — redeploy + smoke on `www.game-mind.ru` (2026-07-22 — user-verified)
- [x] Mark Status = ongoing in `TASTE_SKILL.md` §1

**Incremental backlog (see `TASTE_SKILL.md` §14)**

- [x] Task 1 — Design tokens + typography
- [x] Task 1b — Home brand hero
- [x] Task 2 — Button + focus states
- [x] Task 3 — Answer options clarity
- [x] Task 4 — Progress + sticky submit UX
- [x] Task 5 — Question screen polish
- [x] Task 6 — Result summary hierarchy
- [x] Task 7 — Mobile pass quiz flow
- [x] Task 8 — Loading / error / empty / disabled
- [x] Task 9 — A11y + visual smoke

**Ongoing**

- [ ] New feature UI uses Prompt T-Feature; append §7 every visual session
- [ ] Shared primitives in `src/shared/ui` grow with the product
- [ ] Periodic T-Audit-Lite if visual drift appears
- [ ] One UI task per chat; commit after each task before the next chat

**Do not**

- [ ] Start foundation while Epic 4 / Epic 5 still incomplete on prod (~~was blocker~~ — **cleared** July 18 evening)
- [ ] Touch quiz snapshot / scoring / direct `pg` in visual PRs
- [ ] Hardcode strings; break IMAGE_GUESS full-frame; invent a second theme system
- [ ] Skip the change log

#### 11.9 Perceived performance & smooth interaction (planned July 18, 2026)

**Goal:** navigation and mutations feel responsive — loaders, skeletons, pending states, lazy media, careful memoization. Complements §11.8 (brand) with **interaction quality**.

**When:** light items anytime; full pass preferred **now that 11.1–11.5 are on prod**, **in parallel with or just before §11.8 Wave A/B** (style loaders with design lock when possible).

**Already started (do not remove):**

- [x] Admin `loading.tsx` (hub, questions, users, edit)
- [x] Quiz session progress + sticky submit
- [x] `QuestionImage` loading / error states
- [x] Admin list `loadFailed` + retry link
- [x] Admin hub so heavy lists are opt-in from header

**Route-level loading / skeletons**

- [x] `loading.tsx` (or shared skeleton) for: home, login, register, quiz setup, quiz session, result, leaderboard, profile (+ locale fallback)
- [x] Skeletons mirror rough final layout (avoid layout shift) — `PageSkeleton` variants
- [x] Shared skeleton primitives in `src/shared/ui` (`Skeleton`, `PageSkeleton`)

**Navigation pending UI**

- [x] Header / primary Links: pending/busy affordance via `PendingLink` + `useLinkStatus`
- [ ] Optional: top progress bar or subtle opacity on outgoing page (deferred — cue on link is enough for light)

**Server Action pending UI**

- [x] Auth: login / register submit — `SubmitButton` + `useFormStatus`
- [x] Quiz: start + submit — busy state while action runs
- [x] Profile: password / username / avatar forms (+ logout)
- [x] Admin: question + user mutation buttons (deactivate/delete/role)

**Lazy loading & code splitting**

- [x] Quiz images below the fold: `loading="lazy"` (first IMAGE_GUESS priority) — already in `QuestionImage`
- [ ] Dynamic import heavy client-only islands (review filters, admin dense tables) where it helps TTI — later
- [x] Do not lazy-load critical auth/quiz setup above the fold without skeleton

**Memoization & React performance**

- [ ] Measure first (React Profiler / slow interactions) — no blanket `useMemo`/`useCallback` (deferred)
- [x] Prefer Server Components; keep client islands small
- [ ] Follow repo React Compiler guidance; memoize large list row mappers only if needed
- [ ] Avoid re-fetching unchanged server data on trivial client toggles (filters: client state OK)

**Empty / error / success feedback**

- [x] Consistent empty states: leaderboard, profile history, admin lists — **Taste Task 8** (further density polish optional)
- [x] Inline success toasts after profile/admin mutations — July 30 (Sonner; see DECISIONS Toast)
- [x] Keep fail-fast Neon errors + retry — never infinite spinners

**Motion & a11y**

- [ ] Light enter/press motion (2–3 intentional patterns); quiz answer UI stays calm — optional later
- [x] Respect `prefers-reduced-motion` — **Taste Task 9**
- [x] Visible focus + disabled button semantics (`aria-busy` on pending submits)

**Light pass status (July 18 night):** **done** for route loaders + nav/form pending. Tasks 8–9 added empty/alerts + reduced-motion. Remaining: top progress bar / dynamic imports / enter motion — optional.

**Do not**

- [ ] Fake progress that hides real failures
- [ ] Remove Neon timeouts to “feel faster”
- [ ] Over-animate admin tables
- [ ] Block §11.8 forever waiting for perfect loaders

#### 11.7 Maintainability — repository / module split (deferred)

**When:** after 11.1–11.5 are live, **or** immediately before a new quiz mode that would grow session/question repos further. **Not** during an active UX epic or during §11.8 Taste Skill waves.

See `PROJECT_CONTEXT.md` → **Deferred Code Refactoring** and `DECISIONS.md` → **Repository File Split**.

- [x] Split `question.repository.ts`: admin CRUD vs quiz pick/display; thin facade export (July 26)
- [x] Split `quiz-session.repository.ts`: types + snapshot helpers + start + submit + reads; thin facade (July 27; committed `34a00d2`); relational create stays inside start module (no separate legacy file)
- [x] Preserve stable import paths for features (`questionRepository`, `quizSessionRepository`, `load*`, `warmAdminListConnection`)
- [ ] Optional verify: manual start→submit→result after split (smoke if not already done)
- [ ] Optional: split Auth.js session helper from Credentials authorize (layout module graph)
- [x] Do **not** start this mid–result-review / mid–profile work / mid–Taste Skill redesign

#### 11.10 Automated testing (learning track — July 27, 2026)

**Goal:** learn testing from zero while adding useful automation. Canon: `docs/TESTING.md`. ADR: `DECISIONS.md` → Automated Testing Adoption. Chat: **Prompt V** (new chat).

**Phase A — Vitest foundations** (first)

- [x] Install Vitest + minimal TS config
- [x] `npm run test` (+ optional watch)
- [x] Unit tests for `getQuestionPublishQualityIssues` / `hasPublishQualityBlockers`
- [x] Learner can explain unit vs E2E and AAA; can add one case with mentoring
- [x] Update `docs/TESTING.md` Status → `phase-a-done`

**Phase B — more pure units**

- [x] scoring.ts unit suite (weights + calculateQuizScore)
- [x] admin filter parse (parse + hasActive + buildHref)
- [x] Still no Neon in unit suite
- [x] Product follow-up (not Phase B checklist): `parse-bulk-question-ids` unit suite (7) with bulk isActive — full suite **29** passed

**Phase C — smoke scripts**

- [x] Document which `scripts/smoke-*.cjs` to run when
- [x] Do not blindly migrate smokes into Vitest

**Phase D — optional Playwright**

- [ ] 1–2 flows only (e.g. publish quality blocked)
- [ ] After Phase A literacy

**Phase E — optional CI** ✅

- [x] GitHub Action: `npm run test` on push/PR to `master` (`.github/workflows/test.yml`)
- [x] Local suite stable (29); Actions run #1 success (`e68f532`, July 28) — no Neon in unit job

**Do not**

- [ ] Start with Playwright or 100% coverage
- [ ] Mix Taste redesign / Neon SQL rewrites into the testing learning chat
- [ ] Skip teaching — implementation-only without explanations
