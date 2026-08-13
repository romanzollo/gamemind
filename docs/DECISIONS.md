# GameMind Architecture Decisions

ADR-style log of **why** choices landed (dated, incremental). Tracked in git — no secrets.

For a stable overview of layers, Neon access, quiz invariants, auth, and media, read **`docs/ARCHITECTURE.md`** first. Binding quiz/Neon rules: **`docs/QUIZ_NEON_HOT_PATH.md`**.

## Collaboration

- The user wants to learn and write most code manually.
- The AI should normally provide detailed file-by-file instructions.
- Direct code edits are allowed only when explicitly requested.

## Product stage (July 26, 2026)

**Decision:** GameMind is labeled **`public beta`** (live portfolio product at `www.game-mind.ru`), not a private ?technical MVP?.

**Why:** core loop, auth, profile, media, admin ops, bilingual content, production deploy, and Scoreboard Editorial identity are real and usable by friends.

**Implication:** next work is product growth (admin QoL remainder, content quality, modes later) ? do not frame tasks as ?must finish MVP first?.

## Auth

- Use Auth.js / NextAuth v5.
- Use credentials auth for MVP.
- OAuth is postponed until after core MVP flow is stable.
- Store passwords as bcryptjs hashes.
- Use JWT sessions for MVP.
- Store `id`, `username`, and `role` in JWT/session.
- Use `proxy.ts` for Next.js 16 route protection and locale redirects.
- Keep proxy edge-safe: do not import Prisma, bcrypt, or server-only modules into proxy.
- Protect `/:locale/profile` for authenticated users.
- Protect `/:locale/admin` for `ADMIN` role.
- Use server-side guards:
  - `requireUser()`;
  - `requireAdmin()`.
- Admin checks must happen in Server Actions too, not only in UI or proxy.
- Auth redirects should preserve the current locale when possible.

### Authoritative user status for JWT guards (July 25, 2026)

**Problem:** Auth.js JWT sessions deliberately store `id`, `username`, and `role` for fast session reads, but JWT is stale by nature. After an admin demotes/deactivates/deletes a user, an already issued token can still carry the old role until refresh/expiry.

**Decision:** `requireUser()` and `requireAdmin()` must treat JWT as identity only, then load the current `User` row from the database:

- deleted user ? redirect to login;
- `isActive = false` ? redirect to login;
- admin access uses current DB `role`, not token `role`;
- returned session user is overwritten with current DB `username`, `email`, `role`, and `image`.

**Why:** Admin user management is a security feature, not only UI. Soft-disable and demote must affect existing sessions on the next protected request/action.

**Boundary:** `proxy.ts` stays edge-safe and may still use JWT for fast route UX. Real protection remains in server pages/actions through `requireUser()` / `requireAdmin()`.

**Follow-up:** rate limiting for auth/profile/upload/quiz shipped July 25 (in-memory MVP ? see below); consider a `sessionVersion`/`tokenVersion` only if DB reads in guards become a measured problem.

### In-memory rate limiting for Server Actions (July 25, 2026)

**Problem:** Without request caps, login/register allow password brute-force and account spam; password/avatar/upload burn bcrypt/sharp/Blob; quiz start/submit can spam the Neon hot path.

**Decision:** fixed-window in-memory limiter in `src/lib/rate-limit.ts` + identity helpers in `src/lib/rate-limit-key.ts`:

| Scope | Identity | Preset | Typical limit |
|-------|----------|--------|----------------|
| login / register | IP (`ip:?`) | `auth` | 10 / **15 min** |
| change password | `userId` | `password` | 5 / 15 min |
| change avatar | `userId` | `avatar` | 10 / 15 min |
| admin create/update question (incl. image) | admin `userId` | `upload` | 20 / 15 min |
| quiz start + submit (shared bucket) | `userId` | `quiz` | 30 / 15 min |

- Check runs **early** in the Server Action (after auth guard when needed, before bcrypt / sharp / Neon work).
- On limit: return stable `RATE_LIMITED` errorCode; UI maps via dictionaries (ru/en). Do not throw 500.
- Quiz snapshot / scoring SQL unchanged ? only a gate at action entry.
- Store lives on `globalThis` so Turbopack HMR does not wipe the Map between login attempts in `next dev`.
- All presets use a **15 minute** window: a single failed/slow attempt on Neon+bcrypt (or sharp/Blob) can take many seconds; a 60s window could reset before reaching the limit (observed on auth July 25 smoke).

**Why in-memory (not Redis/Upstash yet):** zero new deps; enough best-effort protection for Hobby MVP. On Vercel, each instance has its own Map ? not a global quota. Upgrade to Redis when abuse or multi-instance fairness becomes a real problem.

**Do not:** put rate limit logic in Client Components; import `rate-limit-key` (uses `next/headers`) from the client; rely on proxy-only throttling as the sole defense.

### Admin home counts on hub (July 25, 2026)

**Problem:** `/admin` hub was only navigation (Questions / Users) with no glanceable ops stats. Admins had to open lists to see bank size or activity.

**Decision:**

- Add `findAdminHomeCounts()` in `src/entities/admin/admin-home.repository.ts`.
- One unpooled `withDirectPgClient` round-trip with scalar `COUNT(*)` subselects: `User` total, `Question` active/inactive, `QuizSession` with `startedAt >=` start of **UTC** calendar day.
- No schema/migration; no translation JOINs; do **not** use `withAdminListPgClient` (list hang queue is a separate contract).
- Hub page loads counts in `try/catch`: on failure show localized `homeCountsUnavailable`, keep cards + `warmAdminListConnection`.
- Presentation: Scoreboard Editorial ? mono tabular numbers, caps labels, primary accent only on sessions strip + card hover/chevron; Users shows a single number (title already names the section).

**Why:** ops QoL without draft workflow complexity; keeps hub fast and avoids replaying July 24 admin-list hang class.

**Do not:** turn hub into a multi-KPI marketing dashboard; put counts SQL on the admin list connection queue; block hub render on counts failure.

### Admin user support detail (July 25, 2026)

**Problem:** Admin users list showed only a result *count*. Support needed to see *which* quizzes a user finished (score / difficulty / date) without schema or impersonation.

**Decision:**

- Route `/:locale/admin/users/[id]` behind `requireAdmin`; missing user ? `notFound()`.
- `userRepository.findByIdForAdmin` ? same safe field set as list (`AdminUserRow`), unpooled direct `pg`, never `passwordHash`.
- Recent results: reuse `quizResultRepository.findRecentByUserId` (limit 20) + feature mappers; history load failure does not hide the user card.
- **No links** to `/:locale/result/[sessionId]` for other users ? result page stays owner-only; avoid broken UX and accidental ownership leaks.
- Mutations (role / isActive / delete) stay on the list; detail is read-only.
- List UX: same Scoreboard pattern as **questions** ? surface cards `&lt;lg`, table `lg+` with sticky **nowrap** text-actions (avoid full-width CTA / 2-col grid / inline `<details>` that inflate rows).
- History UI on detail: mirror **ProfileResultHistory** (phone scoreboard stack + sm+ table, difficulty chips, success ???????); still **no** ??????? column.

**Why:** support QoL without draft workflow, without new tables, without opening result review to admins yet; one visual language with profile + questions lists.

**Do not:** return `passwordHash`; trust client `userId` for mutations; put this read on the admin-questions hang queue; invent admin impersonation; reintroduce over-built action chrome that diverges from questions/profile.

### Admin session answer review ? deferred (July 26, 2026)

**Status:** **not now.** Aggregates on user detail are enough until real support friction appears.

**Product trigger (any one is enough):**

1. Recurring ?why wasn?t this counted?? / score disputes;
2. Admins regularly QA the question bank via other users? plays;
3. Support volume where date/score/correct alone is not enough.

**When to schedule (preferred order):**

1. **After** current slice is committed + optionally on prod (user detail stable).
2. **Prefer after** ?11.7 quiz-session repo split *if* that split is already planned soon ? review reads live in `quiz-session.repository`; cleaner to extend a split module than grow the ~1200-line file mid-feature.
3. **Do not** bundle with draft/review/publish schema, Taste waves, or a new quiz mode.
4. Fine to do **before** draft workflow if support pain is real ? no schema required for MVP admin review.

**Complexity if added now:** **S?M (low?medium), not hard.** Reuse existing `findReviewForUser` / `mapQuizResultReview` / `QuizResultReview` UI. Main work is **access control**, not new scoring SQL.

**How to implement correctly (when chosen):**

1. Keep player `/result/[sessionId]` owner-only for normal USER ? do not open it to everyone.
2. Access rule: **owner OR `requireAdmin`** (DB-authoritative admin via existing guards). Prefer one shared helper e.g. `requireResultViewer(sessionId)` over duplicating checks.
3. **Read-only** from **session snapshot** (+ stored answers) ? same path as player review; never live `Question` pool; never let admin rewrite score from UI.
4. Entry point: ??????? only from `/:locale/admin/users/[id]` history (and optionally self profile). Do not advertise as a public share URL.
5. Optional later: audit log ?admin X viewed session Y? ? not MVP.
6. Do not mix with impersonation, password exposure, or mutating another user?s result.

**Do not:** weaken owner check without admin branch; trust client `userId`; recalculate score from live bank; start this mid?draft-workflow or mid??11.7 move.

### Header nav visibility (July 14, 2026)

**Decision:** nav links are role/session-aware. Hiding a link is UX only ? route guards remain the real security boundary.

| Audience | Visible nav |
|----------|-------------|
| Guest | Home, Quiz, Login, Register |
| USER | Home, Quiz, Leaderboard, Profile, Logout |
| ADMIN | USER links + Admin |

- Layout calls `auth()` and passes a minimal `{ username, role }` into `SiteHeader`.
- Auth CTAs live in `features/auth/components/HeaderAuthControls` so `shared/ui` does not import feature Server Actions.
- Leaderboard stays a **public page** (no `requireUser`); guests simply do not see it in the nav until logged in.
- Quiz setup remains visible to guests as the main CTA; starting a quiz still requires `requireUser()` / login.

## Theme And I18n

- Use locale-prefixed routes for public UI:
  - `/ru/...`;
  - `/en/...`.
- Default locale is `ru`.
- Keep dictionaries in `src/shared/i18n`.
- Keep the `Dictionary` type in `src/shared/i18n/dictionaries/dictionary.ts`; locale files (`ru.ts`, `en.ts`) contain only string values.
- Start without an external i18n library for MVP.
- Consider `next-intl` later only if pluralization, date/number formatting, nested message tooling, or middleware complexity grows.
- Use CSS variables for theme tokens.
- Switch theme through `data-theme="light" | "dark"` on `<html>`.
- Store theme in a cookie/localStorage so refresh keeps the selected theme.
- When tokens are exposed through `@theme inline`, use Tailwind shorthand utilities (`bg-primary`, `text-foreground`, `border-border`, `rounded-md`, `shadow-sm`) instead of arbitrary class syntax (`bg-(--primary)`, `text-(--foreground)`, etc.) to avoid repetitive lint warnings and keep class names consistent.
- Keep UI strings out of quiz business logic; feature logic should use stable keys or domain values.
- **Full app i18n is a product goal:** UI dictionaries are done; question/answer text follows current route locale from bilingual snapshot (or v1 ID overlay).
- `sessionLocale` on `QuizSession` is start-language metadata; display locale is the current URL locale.

## Question And Answer Content I18n

**Decision:** quiz questions and answer options must be localized like the rest of the app. Route locale (`ru` | `en`) is the source of truth for which translation to **display**.

**Current state (July 21, 2026):** **shipped + bilingual snapshot.** New sessions store `snapshotData.version: 2` with `texts: { ru, en }` per question/option. Quiz and result pages pass the current route `locale` into repository reads and pick display text from the snapshot. Legacy `version: 1` sessions (single frozen `text`) overlay live translations by question/option IDs when rendering. Scoring remains language-agnostic (`optionId` + `isCorrect`). Legacy `Question.text` / `AnswerOption.text` remain as `ru` cache.

**Target behavior:**
- `GET /ru/quiz/...` ? question and option labels in Russian.
- `GET /en/quiz/...` ? question and option labels in English.
- Switching locale on the **same** `sessionId` changes labels only; set, shuffle order, and correctness stay frozen.
- Admin creates/edits **both** locales for the same logical question (one `Question` id, many translations).
- Missing translation for active locale ? fallback to `ru` (default locale) and optional admin warning later.

**Recommended schema:**
- `QuestionTranslation`: `id`, `questionId`, `locale`, `text`; `@@unique([questionId, locale])`.
- `AnswerOptionTranslation`: `id`, `optionId`, `locale`, `text`; `@@unique([optionId, locale])`.
- Keep `Question` / `AnswerOption` for identity, `isCorrect`, `order`, `difficulty`, `isActive` ? not per-locale.
- Optional: deprecate `Question.text` / `AnswerOption.text` after migration, or keep as `ru` cache during transition.

**Read path (quiz / result):**
- Prefer bilingual snapshot `texts[locale]` ? `ru` ? legacy `text`.
- v1 overlay: `loadLocalizedTextsByQuestionIds(locale, ids)` when `texts` are absent.
- Scoring uses snapshot `optionId`s only (no text).

**Write path (admin):**
- Extend `createQuestionSchema` / update schema with `translations: { ru: { text, options[] }, en: { ... } }` or flat `textRu` / `textEn` fields.
- Transaction: upsert `Question` + options + all translation rows.

**Implementation timing:**
1. After admin **edit** baseline works (same form can gain locale tabs).
2. Before declaring i18n feature complete for portfolio/production.
3. Coordinate with **quiz session snapshot**: store bilingual display strings in snapshot (`version: 2`).

**Anti-patterns:** duplicate `Question` per language; Google-translate on the fly in UI; storing `isCorrect` per locale; client-only translation maps not in DB; freezing only one locale in snapshot when the product requires mid-session language switch.

**Interim (small bank):** JSONB `translations` on question/option ? acceptable short-term; migrate to tables before scale.

**Seed:** `scripts/seed-questions.cjs` + `scripts/seed.cjs` insert `ru` + `en` translation rows.

## Question Media And Visual Question Types

**Decision:** visual questions (screenshot / image prompt) are a **first-class domain feature**, not a JSON hack in `Question.metadata`. They extend the existing snapshot + i18n architecture ? they do not replace it.

### Product types (discriminated by `QuestionType`)

| Type | Prompt | Answers | Example |
|------|--------|---------|---------|
| `TEXT` | Localized text (optional illustration later) | Text options | ?Who developed The Witcher 3?? |
| `IMAGE_GUESS` | Image + short localized caption | Text options | Screenshot ? guess game / level / character |
| `IMAGE_OPTIONS` (later) | Text or image | Image or text tiles | Pick the correct character portrait |
| `AUDIO_GUESS` (later) | Audio clip + caption | Text options | Guess OST / boss theme |

**MVP target:** `TEXT` (current) + `IMAGE_GUESS`.

### Schema (recommended)

```prisma
enum QuestionType {
  TEXT
  IMAGE_GUESS
}

enum QuestionAssetRole {
  PROMPT
  HINT
  THUMBNAIL
}

model Question {
  // existing fields?
  type QuestionType @default(TEXT)
  assets QuestionAsset[]
}

model QuestionAsset {
  id         String            @id @default(cuid())
  questionId String
  role       QuestionAssetRole @default(PROMPT)
  url        String            // public HTTPS or app-relative /quiz-images/...
  storageKey String?           // object key when using Blob/S3 (adapter)
  mimeType   String?
  width      Int?
  height     Int?
  byteSize   Int?
  order      Int               @default(0)
  question   Question          @relation(...)
  @@index([questionId, role])
}
```

**Snapshot extension:**

```prisma
model QuizSessionQuestion {
  // existing?
  displayImageUrl String? // frozen at session start; null for TEXT-only
}
```

**Why not only `metadata.imageUrl`?**

- Hard to validate, query (?all image questions missing asset?), and snapshot consistently.
- Admin upload and seed need a stable contract.

**i18n rule:**

- Image file is usually shared across `ru` / `en`.
- Localized **caption** stays in `QuestionTranslation.text` (e.g. EN: ?Which game is shown?? / RU: ??????? ???? ?? ??????????).
- Optional later: `QuestionTranslation.altText` for screen readers per locale.

### Storage

| Stage | Approach |
|-------|----------|
| Local / seed | `public/quiz-images/{difficulty}/{slug}.webp` ? committed; same-origin (proven from RU) |
| Production uploads | **Vercel Blob** + same-origin `/media/...` (see **Media Storage And Upload (RU-first)**). Fallback: Yandex Object Storage. |
| Avoid / demoted default | Postgres bytea; unstable hotlinks; **Cloudflare R2 as default** (ops + RU delivery risk ? see RU-first ADR) |

**Upload rules (admin):**

- Allowed: `image/jpeg`, `image/png`, `image/webp`.
- Max size e.g. 2 MB; max dimension e.g. 1920px (resize on server if larger).
- Store WebP when possible for quiz bandwidth.

### Read / write paths (fit existing architecture)

**Quiz start (`startQuizAction`) ? performance-critical:**

Current flow (July 2026):

1. `pickRandomActiveSnapshotBundle` ? **direct `pg`** (`DATABASE_URL_UNPOOLED`) picks random active questions and resolves localized question/option text + `isCorrect` in one read.
2. `createWithJsonSnapshot` ? **pooled `pg`** (`DATABASE_URL`) inserts one `QuizSession` row with frozen `snapshotData` JSONB.
3. Quiz page and submit read `snapshotData` first; relational snapshot tables remain fallback for legacy sessions.

**Rule for media:** step 2 **must** become **one direct `pg` query** that returns, per picked question id:

- resolved question `displayText` (locale ? `ru` ? legacy);
- resolved option texts;
- prompt `displayImageUrl` from `QuestionAsset` (`role = PROMPT`) or `NULL` for `TEXT`.

Do **not** add step 2b (separate asset query). Do **not** keep step 2 on Prisma after media ships.

Then step 2 must include image data in `snapshotData.questions[].image` (and optionally `displayImageUrl` on `QuizSessionQuestion` for relational fallback/audit).

**Quiz page:**

- Read snapshot only ? prefer `QuizSession.snapshotData`; relational snapshot tables are fallback for legacy sessions.
- **No join** to `QuestionAsset` on quiz page ? URL should already be frozen in snapshot.
- Map to `QuizPublicQuestion` with `image?: { url, alt }`.

**Scoring:**

- No change ? still `optionId` validation against snapshot options.

**Admin (cold path ? can be slower, still avoid known traps):**

- `AdminQuestionForm`: `type` select (`TEXT` | `IMAGE_GUESS`); **prompt image URL** field when `IMAGE_GUESS` (site path `/quiz-images/...` or HTTPS CDN URL).
- **Shipped (July 2026):** create and edit both via **single bulk direct `pg` CTE** ? question, translations, options, `Question.type`, PROMPT asset upsert/delete in one statement (no Prisma nested create; no `Promise.all` on one client). Create became direct `pg` after Prisma nested create reproduced Neon `not queryable` + ~90s Server Action timeout on `IMAGE_GUESS`.
- **Next:** admin file upload ? storage adapter (`STORAGE_PROVIDER`) ? store same-origin `/media/quiz/...` (or legacy path) in `QuestionAsset` (resize/WebP at upload time only). See **Media Storage And Upload (RU-first)**. Cloudflare R2 is **not** the default.
- List page: do not eager-load full image binary; optional `thumbnailUrl` in list query later.

### Performance and Neon constraints for media

**Principle:** images are **static HTTP assets**; the database stores only **short URL strings**. Slow loads must not be confused with slow DB ? but bad DB design on quiz start still blocks the whole page.

| Symptom (historical) | Cause | Media rule |
|----------------------|-------|------------|
| `startQuizAction` 40s?3min | Prisma transaction / many round-trips on Neon; later, awaiting `pg client.end()` and relational snapshot writes also caused 20s+ waits | Never add asset Prisma reads; keep quiz start to direct read + one pooled JSONB insert; do not await `client.end()` before responding |
| Quiz page intermittent 20?40s | Prisma stale pool on snapshot read | Quiz page already direct `pg`; only add column to SELECT |
| `Connection terminated unexpectedly` on admin save | Many sequential upserts / `Promise.all` on one client | Upload + one bulk SQL for metadata; resize at upload not at quiz start |
| 60?120s wait | `withDatabaseRetry` around direct `pg` | Never wrap quiz direct `pg` in Prisma retry |
| COMMIT hang | Explicit transaction on Windows + Neon | Snapshot stays autocommit when adding `displayImageUrl` column to INSERT |

**`startQuizAction` budget (dev target):**

- Pick + resolve text + image URL: one direct `pg` read.
- Snapshot write: one pooled `pg` insert into `QuizSession.snapshotData`.
- No Prisma on this action.
- Do not await slow Neon socket close (`client.end()`) before returning the Server Action response.

**Image delivery (browser):**

- Dev seed: `public/quiz-images/**/*.webp` ? optimize files (&lt;200 KB, max ~1280px wide).
- Production: Vercel Blob / R2 with public URL stored in `QuestionAsset.url`.
- `next/image` with `sizes`; lazy load images for questions after the first.
- Optional `placeholder="blur"` with tiny `blurDataURL` in DB or static map ? not required for MVP.
- Images **never** go through API route that hits Neon.

**What not to optimize prematurely:**

- Combining pick-random + resolve into one SQL is optional later; **combining resolve-text + resolve-image** is required.
- Image CDN is more important than SQL micro-optimizations once URLs are snapshot-frozen.

### UI (beautiful presentation)

**Shipped (July 14, 2026):**

- `QuestionCard` + `QuestionImage` for IMAGE_GUESS prompts.
- Prefer **native `<img>`** for local `/quiz-images/` assets so real aspect ratios are preserved (NES/GB are not 16:9).
- Soft theme frame: `bg-surface-muted` + border ? **not** cinema black bars.
- Full frame visible (contain-style); do **not** use `object-cover` + fixed `aspect-video` for guess prompts (cropped Mario/Zelda/Pok?mon).
- `normalizeQuizImageUrl`: map legacy frozen `/quiz-images/**.svg` snapshot URLs ? `.webp` so refresh works after placeholder removal.
- Handle load error + cached `img.complete` so frames are not stuck invisible.
- Pixel-art easy paths may use `image-rendering: pixelated`.

**Still fine later / CDN:**

- `next/image` is OK for remote Blob/R2 HTTPS URLs once dimensions are known.
- Optional `blurDataURL` / skeleton already soft-pulse while loading.

- Text-only questions use same card without image slot ? consistent spacing.
- Mobile-first: image max-height capped; options below with large tap targets.

### Legal and content quality

- Use screenshots you have rights to (own capture, press kit, permissive license).
- Record `metadata.source` / `gameTitle` for audit.
- Crop HUD/menus if they make guessing trivial or ugly.
- Do not scrape Steam/Google Images at runtime.

### Implementation timing

**When:** after Phase 2 i18n + text question bank (done). **Before** daily challenge / timed modes.

**Order (performance-aware):**

1. Phase 4 start: design tokens + `QuestionCard` (text-only) ? no DB.
2. **Prerequisite:** migrate `findSnapshotDisplayTextsByCandidates` from Prisma to **one direct `pg` query**; verify `startQuizAction` latency on Neon.
3. Schema migration: `QuestionType`, `QuestionAsset`, `QuizSessionQuestion.displayImageUrl`; update snapshot INSERT/SELECT in `quiz-session.repository.ts`.
4. Extend direct `pg` resolver (step 2) with `LEFT JOIN QuestionAsset` for prompt URL; pass `displayImageUrl` into `createWithSnapshot`.
5. Quiz UI: `QuestionImage` + lazy `next/image` (static URLs only).
6. Admin upload (cold path) + extend bulk edit SQL for assets.
7. Seed 10?15 `IMAGE_GUESS` + extend verify script (asset URL present, file size note in docs).

**Do not implement image answer tiles before `IMAGE_GUESS` prompt flow is stable and quiz start stays on direct `pg`.**

### Anti-patterns

- Duplicate `Question` per image variant instead of `QuestionAsset` rows.
- Client-side-only image URLs not stored in DB.
- Serving different image on refresh (must snapshot `displayImageUrl`).
- Trusting client-uploaded `imageUrl` on submit/scoring.
- Putting full image pipeline before basic `QuestionCard` layout exists.
- **Prisma `findMany` + include for translations/assets on `startQuizAction`.**
- **Second DB round-trip only for images** after text resolution.
- **Image bytes in Postgres** or serving images through Server Actions that open DB connections.
- **`withDatabaseRetry(directPgFn)`** or parallel queries on one `pg.Client` for admin asset save.
- **Resizing/processing images inside `startQuizAction`** (do at upload/seed time only).

## Database

- PostgreSQL through Neon.
- Use pooled `DATABASE_URL` for the app and unpooled/direct URL for migrations/seed.
- Keep Prisma Client in `src/lib/prisma.ts` with `@prisma/adapter-pg`.
- Configure the `pg` pool conservatively for Neon/local development:
  - small connection pool;
  - short idle timeout to avoid stale sockets;
  - explicit connection timeout.
- Do not use a short global query timeout for Prisma reads during MVP development; it caused false `Query read timeout` failures on the quiz session page.
- Keep a centralized `withDatabaseRetry()` helper for transient database connection errors such as `Connection terminated unexpectedly`.
- Do not remove this retry before production by default. Transient network/database errors can still happen in production; the retry is acceptable when limited to idempotent reads.
- Apply `withDatabaseRetry()` to idempotent Prisma read methods in repositories. Admin question paths no longer rely on Prisma writes.
- `connectionTimeoutMillis` is **15000** in the Prisma pool config (was 5000). Direct/pooled read helpers use a separate hard `Promise.race` budget (12s) because node-pg connect timeout alone can hang on Windows + Neon.
- When resetting the Prisma pool after a transient error, **do not await** `pool.end()` / `$disconnect` on the request path (same ~19s Neon socket-close issue as quiz `client.end()`).
- Pages that render non-critical DB-backed lists should handle read failures gracefully. Admin question list catches `findAllForAdmin()` failures and shows `dictionary.admin.errors.loadFailed`; leaderboard catches `findBestScores()` failures and shows `dictionary.leaderboard.loadFailed`.
- Local dev slowness with Neon is expected in worst case: cold start + stale pool socket + Turbopack + optional Node debugger. Prefer fail-fast + localized error over multi-minute waits.
- Cursor's global JavaScript auto attach debugger should stay disabled for normal app development; it caused repeated `Debugger listening` / `Debugger attached` logs and extra dev overhead.
- Prisma schema currently includes:
  - `User`;
  - Auth.js models;
  - `Question`;
  - `AnswerOption`;
  - `QuizSession`;
  - `QuizAnswer`;
  - `QuizResult`.
- `Question.metadata` is currently flexible JSON.
- Avoid over-modeling filters until the quiz flow proves what queries are needed.

## Questions

- Start with manually seeded questions.
- Seed currently uses `scripts/seed.cjs` with raw `pg` because Prisma Client writes were unstable on Windows + Neon during seed operations.
- Every question should have multiple answer options and exactly one correct answer.
- Scoring must be calculated or validated on the server.
- Do not trust client-submitted score, userId, role, or result.

## Quiz Flow

- Quiz setup creates `QuizSession` and persists a frozen snapshot of selected question ids, localized display text, per-session option order, and correctness.
- Current hot path stores the snapshot in `QuizSession.snapshotData` JSONB because writing 10 questions ? 4 options into relational snapshot tables was flaky/slow on local Windows + Neon.
- `QuizSessionQuestion` and `QuizSessionQuestionOption` remain in the schema as legacy/fallback and possible future audit/query tables, but current quiz start does not write them.
- Quiz page and `submitQuizAction` read from the same snapshot for the same `sessionId` (not the live active question pool).
- `findSnapshotPublicQuestionsForUser` (UI) and `findSessionForSubmit` / scoring snapshot (submit) are the read entry points; critical quiz reads use direct `pg` because Prisma/adapter-pg was flaky with Neon in local Windows dev.
- `startQuizAction` picks random active questions and shuffles options once before persisting snapshot.
- Quiz submit validation errors use `useActionState` and user-visible messages; selected answers are kept in client state so a failed submit does not wipe the user's choices.
- Public quiz UI must never expose `isCorrect`; scoring reads correct answers only on the server via snapshot-bound `optionId`s.

## Neon Write Path For Quiz Snapshot

**Problem observed (Windows + Neon + Prisma `@prisma/adapter-pg`):**

- `createWithSnapshot` via Prisma nested create or `$transaction` repeatedly failed with:
  - `P2028` / `Transaction already closed` (5s interactive transaction timeout);
  - `Client has encountered a connection error and is not queryable`;
  - `Connection terminated unexpectedly` during multi-step writes;
  - very long `startQuizAction` waits (40s?3min) with retries.
- At first reads often worked, but later local dev showed the same stale-connection pattern on critical quiz reads:
  - question pick at quiz start;
  - quiz page snapshot load;
  - submit scoring snapshot load;
  - result page load.
- Pooled `DATABASE_URL` + pgbouncer is especially bad for long/interactive transactions.

**Decision (pragmatic, not a domain change):**

- **Do not use explicit `BEGIN/COMMIT` in the critical quiz flow on local Windows + Neon.** Smoke testing showed autocommit snapshot writes succeed in ~1?2s, while the same insert set inside an explicit transaction consistently failed on `COMMIT` after ~20s with `Connection terminated unexpectedly`.
- **Writes for quiz snapshot creation** currently use a pragmatic JSONB snapshot:
  - **Classic / Blitz / Daily:** split — pick (Direct read, own budget) then `createWithJsonSnapshot` (Direct INSERT, own budget). Same pattern as commit `940f396` Timed fix.
  - Do **not** use merged `startWithRandomQuestions` (RANDOM pick + INSERT in one 12s client) on hot path: under slow Neon / admin Direct queue this false-fails Classic with `DB_TIMEOUT` while Timed split still works.
  - do **not** use Neon pooler for quiz start in Windows `next dev`;
  - implementation: `pickRandomActiveSnapshotBundle` / `createWithJsonSnapshot` / legacy `startWithRandomQuestions` (unused by actions).
- Why JSONB here is acceptable:
  - it is not the primary content model; live questions/options/translations remain relational;
  - it is an immutable per-session audit snapshot optimized for page rendering and scoring;
  - it avoids fragile multi-row hot-path writes on Neon;
  - the data volume is small (3-10 questions ? 4 options).
- Relational snapshot creation (`createWithSnapshot`) remains available as fallback/legacy, but do not use it for current quiz start unless local/prod DB behavior changes.
- **Writes for quiz submit completion** also use raw `pg.Client` + `DATABASE_URL_UNPOOLED` + autocommit statements:
  - check `QuizSession` by `sessionId + userId`;
  - bulk `INSERT QuizAnswer ... ON CONFLICT DO NOTHING`;
  - `INSERT QuizResult ... ON CONFLICT DO NOTHING`;
  - update `QuizSession.status = COMPLETED`.
- Implementation lives in `quiz-session.repository.ts` ? `completeQuizSessionWithPgClient()`.
- The submit writer is idempotency-aware: if recovery finds the session already `COMPLETED`, the action redirects to the result page instead of showing a false failure. If submit fails before completion, partial answers/result are cleaned up best-effort.
- **Critical quiz reads** use direct `pg` + `DATABASE_URL_UNPOOLED` where needed:
  - `pickRandomActiveSnapshotBundle`;
  - relational fallback reads in `findSnapshotPublicQuestionsForUser`;
  - relational fallback reads in `findSessionForSubmit` / scoring snapshot;
  - `findBySessionIdForUser`.
- Direct `pg` uses fresh short-lived clients in `src/lib/db/direct-pg.ts`:
  - reads use a fresh client with a small retry loop;
  - writes use a fresh client without automatic retry;
  - clients have an `error` listener so Neon socket resets do not become uncaught exceptions.
- Do not block Server Actions on Neon socket teardown: `client.end()` is intentionally fire-and-forget because measured socket close could take ~19s after queries completed.
- Direct `pg` owns its own short retry/reset behavior. Do **not** wrap direct `pg` calls in Prisma `withDatabaseRetry`, otherwise attempts multiply and one transient Neon failure can become 60?120s of waiting.
- Direct `pg` retries are for reads only. Do **not** retry writes blindly; make writes idempotent or verify/cleanup by known ids first. Quiz start writes are **one attempt + recovery outside `withDirectPgQueue`**: retrying a non-idempotent `INSERT` can late-commit attempt 1, duplicate-key attempt 2, and then cleanup a valid session. Do **not** set aggressive `query_timeout` / `statement_timeout` on critical quiz writes.
- Non-critical/admin/list reads can still use Prisma + `withDatabaseRetry` by default, but a read path may move to direct `pg` when Prisma creates multiple round-trips or the route is visibly slow/flaky on Neon.
- Prisma uses pooled `DATABASE_URL` when available; critical quiz direct `pg` uses `DATABASE_URL_UNPOOLED`.
- Public quiz routes with auth/fresh DB rows are always dynamic: Home CTA, `/:locale/quiz`, `/:locale/quiz/[sessionId]`, and `/:locale/result/[sessionId]` use `force-dynamic` + `revalidate = 0`. A start action may redirect to a session/result created seconds ago; stale RSC/notFound payloads are not acceptable there.
- Daily Challenge `ABANDONED` attempts are not resumeable. UI/actions must not link or redirect to `/quiz/:sessionId` for `ABANDONED`, because the quiz page correctly loads only `IN_PROGRESS`. Show “attempt used” instead.

**Symptom ? likely cause ? what to try (quick reference):**

| Symptom | Likely cause | What to try |
|---------|--------------|-------------|
| `startQuizAction` hangs 40s+; `P2028` / transaction closed | Prisma interactive/long transaction on Neon pool | Use raw `pg`; avoid Prisma on quiz start |
| `startQuizAction` hangs ~20s even when queries are fast | Awaiting `pg client.end()` on Neon socket close | Fire-and-forget `client.end()` in direct-pg helper |
| Quiz start works for 3 questions but fails/slows for 5/10 | Writing relational snapshot rows on hot path (`QuizSessionQuestion` + `QuizSessionQuestionOption`) | Store immutable `snapshotData` JSONB on `QuizSession`; keep relational tables as fallback/audit |
| `submitQuizAction` returns `SUBMIT_FAILED`; answers disappear; log shows `Connection terminated unexpectedly` | Multi-step submit write through Prisma transaction or stale Prisma connection | Use raw `pg` + direct URL for submit write; keep radio answers in client state |
| `Client has encountered a connection error and is not queryable` on write | Stale/broken socket via pooled adapter | Same: unpooled direct URL + short SQL transaction; reset pool via `withDatabaseRetry` |
| Critical quiz read waits 20?40s with `Connection terminated unexpectedly` | Prisma adapter/pool stale connection in hot path | Use direct `pg` read against `DATABASE_URL_UNPOOLED`; keep Prisma for less critical screens |
| Non-critical read works once, fails on reload with `Connection terminated unexpectedly` | Neon cold start / idle pool socket | `withDatabaseRetry`; graceful UI fallback on lists; 15s `connectionTimeoutMillis` |
| Admin list `GET` hangs ~2?2.5 min (warm ~800ms) | Stuck Neon TLS/connect; `connectionTimeoutMillis` did not abort; unpooled read retries without wall-clock budget | Unpooled admin reads + `Promise.race` ~30s + `client.end()` abort; show `loadFailed`; restart `next dev` after many timed-out connects |
| Admin list always `loadFailed` at ~24s after hang ?fix? | Pooled admin reads + too-tight 12s?2 timeout in Next.js while quiz unpooled stayed healthy; SQL itself is fine (~0.5s in smoke) | Keep admin list/detail on **unpooled** `withDirectPgClient`; do not use aggressive 12s pooled budget for admin |
| `POST /quiz` succeeds then `GET /quiz/:id` returns 404 | Stale App Router payload or CTA/action points to non-`IN_PROGRESS` session | Force dynamic on quiz/result routes; inspect `QuizSession` row; Daily `ABANDONED` must show attempt-used, not continue |
| Blitz `DB_TIMEOUT` ~12–14s while Classic start works | abandon + 10Q RANDOM + INSERT forced into one Direct timeout budget | Restore Timed split: pick then `createWithJsonSnapshot`; do not use `startWithRandomQuestions` for Blitz |
| Classic `DB_TIMEOUT` ~12–15s while Timed start works | Classic still on merged `startWithRandomQuestions` (pick+INSERT one 12s budget) under slow Neon / Direct queue | Same split for Classic: `pickRandomActiveSnapshotBundle` then `createWithJsonSnapshot`; do not raise timeouts first |
| Classic/Timed `DB_TIMEOUT` on **10Q** while 3/5Q OK; log `Direct pg read retry` | One Direct read did `ORDER BY RANDOM()` + bilingual JOINs for all options under 12s | Split pick: id-only RANDOM, then resolve-by-ids (Daily-style) — two read budgets; do not raise global read timeout first |
| After several starts / Blitz, **everything** hangs (home maybe OK; `/quiz` and starts 20–40s) | Shared `withDirectPgQueue` wedged (spam starts + retries + optional background warm) | Stop spam F5/Start; wait; restart `npm run dev`; check Neon Active. Do **not** confuse with app `RATE_LIMITED` (30/15min). Keep-warm interval in `instrumentation` must stay **off** |
| Classic rematch spinner ~25s / `DB_TIMEOUT` while Timed rematch OK | Rematch POST from `/result` right after heavy submit TLS; Classic was lobby-only or no settle | `rematchClassicQuizAction` → `runClassicQuizStart` + **500ms settle**; keep Timed rematch on `startTimedQuizAction` |
| Classic/Timed start `DB_TIMEOUT` ~20s after UserQuestionCycle; Prisma `COMMIT` then `Connection terminated` | Cycle on Prisma pooled adapter — SQL/scalars OK, teardown false-fail; or cycle on Direct queue wedges start | **Landed (Aug 12):** cycle on `withPooledPgClient` (raw `pg`, outside Direct queue); seeded cursor scalars; no silent random fallback |
| IMAGE_GUESS «преследуют» after cycle «success» | JSONB `remainingIds` hang → Promise.race budget → fallback random; мешок не списывался | **Landed:** seeded `cycleSeed`/`cursor`/`poolSize`; no JSONB bag; no random fallback |
| After submit, `/result/:id` soft-fail; GET 38s–2+min; `Quiz result load failed` | Result Direct read of large JSONB right after write + award on shared queue | **Landed:** summary scalars + client review API + outbox; **open:** review TOAST slow → option B `reviewPayload` |
| Quiz page loads but submit scores wrong set | Scoring still reads live pool, not snapshot | `findSnapshotForScoring` ? validate `optionId` only against snapshot rows |
| Migration `P1017` on Windows | Prisma migrate vs Neon | `scripts/apply-named-migration.cjs` |
| Timed auto-submit `syntax error at or near "ON"` | empty `QuizAnswer` INSERT (`VALUES` + `ON CONFLICT` with 0 rows) | Guard: skip answers INSERT when `answerRows.length === 0`; still write QuizResult + COMPLETED |

### Quiz Start / Session Load Playbook (Aug 4, 2026; hot-path canon locked)

**Tracked binding doc (git):** `docs/QUIZ_NEON_HOT_PATH.md`  
**Cursor always-on rule:** `.cursor/rules/quiz-neon-hot-path.mdc`

**Goal:** stop whack-a-mole — isolate Classic vs Timed; diagnose start/**submit→result**/queue without random timeout bumps.

**Release gate (manual matrix — required before changing shared pick/Direct/settle):**

| Check | Classic 3 | Classic 5 | Classic 10 | Blitz 10 | Daily | Score after submit | Review after submit |
|-------|-----------|-----------|------------|----------|-------|--------------------|---------------------|
| Start 303 | yes | yes | yes | yes | yes | — | — |
| Timer ~60s | — | — | — | yes | — | — | — |
| Score usable &lt; ~2–3s | yes | yes | yes | yes | yes | **OK (summary scalars)** | — |
| Review usable without multi-10s hang | — | — | — | — | — | — | best-effort (`reviewPayload` async) |

#### Canon paths (do not unify casually)

| Mode | Action | DB path | Notes |
|------|--------|---------|-------|
| Classic | `startQuizAction` → `runClassicQuizStart` | **UserQuestionCycle** draw → resolve-by-ids (chunks of 5) → createWithJsonSnapshot | No timedEndsAt. Same cycle bag as Blitz per `userId+difficulty`. |
| Classic rematch | `rematchClassicQuizAction` → same runner | same | Settle before pick from `/result`. |
| Blitz/Timed | `startTimedQuizAction` → `runTimedQuizStart` | **same UserQuestionCycle** → resolve → create; **timedEndsAt after pick** | Always 10Q. Shares bag with Classic. |
| Daily lobby | `getDailyLobbyView` | `findLobbyPanelState` **1 TLS** | |
| Daily start | frozen ids → chunked resolve → create | | **No** UserQuestionCycle. |
| Submit | `submitQuizAction` → `completeWithResult` | answers + **scalar** QuizResult `VALUES` + COMPLETED + outbox | **No JSONB on this hop.** |
| reviewPayload | fire-and-forget after complete | `UPDATE QuizResult.reviewPayload` | Must not fail submit. |
| Result score | `findSummaryBySessionIdForUser` | scalars only | Soft-miss (no `notFound`); retry 400ms. |
| Result award | `ResultSecondaryPanel` | outbox process | Suspense after score. |
| Result review | `QuizResultReviewClientLoader` → API | prefers `reviewPayload` | Soft-fail OK. |

**Pick detail:** `SNAPSHOT_RESOLVE_CHUNK_SIZE = 5`. One 10-id resolve → DB_TIMEOUT; 5-id OK. Changing chunk/pick = full matrix.

**UserQuestionCycle (Aug 12):** Classic/Timed anti-repeat — see section **User Question Cycle (seeded cursor)** below. Cycle hop is **not** on `withDirectPgQueue`.

**Anti whack-a-mole rules:**
1. Never change shared pick/Direct/queue to fix one mode without running the matrix.
2. Classic and Timed have **separate runners** — keep them; share only pure helpers (`buildQuizSnapshotQuestions`).
3. Prefer fewer Direct TLS over more settles. Settles are last resort and must be measured.
4. Keep-warm on quiz Direct queue stays **OFF**.
5. Playbook in this file is canon; if code diverges, update playbook in the same change.
6. Result page must **not** call `notFound()` for miss/timeout (Router Cache sticky 404). Soft-fail + links. Result links: `prefetch={false}`.

**Result incident — landed (Aug 4 night + afternoon):**
- Proven: SQL outside Next ~3ms; hang was connect-OK / operation timeout inside next-dev after submit (TOAST / queue).
- Fixes landed: (1) Direct success teardown = graceful `end()`, destroy only abort; (2) `reviewSnapshot` SQL copy on complete; score path never needs session snapshot TOAST; (3) `AchievementOutbox` same write hop; award after score; (4) summary vs review split; review deferred to client API; (5) soft-miss result page.
- **Still open → landing:** reading full `reviewSnapshot` for UI is often 8–18s. **Option B:** at submit, build compact bilingual review DTO from already-loaded snapshot → column `QuizResult.reviewPayload`; API prefers it; keep `reviewSnapshot` as legacy fallback. Do not raise `READ_ATTEMPT_TIMEOUT` or re-enable keep-warm.

**Recovery if result path regresses:**
1. Restart `npm run dev`.
2. Migration `20260804120000_quiz_result_review_snapshot_outbox` applied? (`reviewSnapshot`, `AchievementOutbox`).
3. Score broken → `quiz.result.summary` hop. Review broken → API + TOAST / after B: `reviewPayload`.
4. Sticky 404 on known session → hard refresh; confirm no `notFound()` on result page.
5. Home/Daily CTA hung → check whether a review hop is holding `withDirectPgQueue` (`waiters` in hop logs).

**Archive — submit → result soft-fail (Aug 4 late, before split):**
- Full result read of large JSONB right after write; award racing on same queue; 18s×2 timeouts blocking home.
- Settles alone insufficient — structural split was required.

**Timed clock:** `timedEndsAt` immediately before INSERT only.

**Direct queue:** one shared `withDirectPgQueue` in next-dev.

#### Triage order

1. Terminal: long `quiz.result.review` / API 503 → review TOAST (or missing B payload).
2. Soft-fail score / soft-miss → summary hop or auth; not start pick.
3. Direct pg read retry on start → pick/resolve chunk.
4. Blitz timer <<60s → `timedEndsAt` too early.
5. Everything hangs → restart `npm run dev`; stop F5 spam.
6. Writes: one attempt + recovery outside queue.

#### Hard rules

- Do **not** call `startWithRandomQuestions` on Classic/Timed hot path.
- Do **not** set Timed `timedEndsAt` before pick completes.
- Do **not** expand lobby Daily back to 3–4 serial Direct calls.
- Do **not** change shared pick / chunk size without matrix (including Result columns).
- Do **not** raise global read timeout as the first fix.
- Do **not** re-enable instrumentation keep-warm on quiz Direct queue.
- Do **not** await `client.end()` on the response path.
- Do **not** nest Direct recovery inside a held queue.
- Do **not** put large review JSONB back into blocking RSC Suspense before score.
- Do **not** use `notFound()` on result for transient miss.
- Do **not** put UserQuestionCycle on `withDirectPg*` / shared Direct queue.
- Do **not** put cycle writes back on Prisma for quiz start (Windows teardown false-fail).
- Do **not** restore silent `pickRandomActiveSnapshotBundle` fallback when cycle fails.
- Do **not** restore drain-then-top-up on cycle boundary (use reshuffle-first).

**Abandoned starts note:** IN_PROGRESS rows are not connection leaks. Spam Start wedges the queue.

**Rule of thumb:** fragile quiz path → direct pg unpooled. Normal CRUD → Prisma.

**When to use this pattern again:**

- Multi-row write on Neon fails through Prisma adapter but migration-style `pg` scripts succeed.
- Errors mention `not queryable`, `P2028`, `Connection terminated unexpectedly` on write-heavy flows.
- A read page is user-visible slow because Prisma turns it into multiple database round-trips, and the same data can be fetched with one clear SQL query.
- Do **not** default all app queries/writes to raw SQL — only proven fragile paths or carefully chosen hot paths.

**Trade-offs (accept consciously):**

- Snapshot create is one `QuizSession` insert with JSONB snapshot on the current hot path. Relational snapshot fallback is still multi-step and has the older partial-write trade-off.
- Submit complete is idempotent (`ON CONFLICT DO NOTHING`) rather than strictly transactional. This is safer on Neon than retrying an unclear `COMMIT`.
- Domain correctness (same questions/options for UI and scoring) is **not** weakened — only infra atomicity model changed.
- Raw SQL has higher maintenance cost: schema changes must update both Prisma schema and SQL manually. Keep queries local to repository methods, small, parameterized, and covered by smoke tests when possible.

**Future cleanup options:**

- **Option B (next):** `reviewPayload` slim bilingual DTO at submit; stop hot-path reads of full `reviewSnapshot`.
- Extract raw snapshot writer to `src/lib/db/quiz-session-snapshot.ts` with a smoke test script.
- On production/Vercel, re-test whether Prisma-only writes work; if stable, consider simplifying — but do not regress Windows + Neon dev without a local Postgres option.
- Keep schema as source of truth; raw SQL must stay aligned with Prisma models/migrations.
- When adding quiz modes (daily challenge, timed quiz), extend snapshot/session model — do not bypass snapshot reads.

**Free Neon note:** free tier can add cold start and connection flakiness, but the main bug was explicit `pg` transactions on this stack, not “free plan blocks quizzes” by itself.

## Quiz Anti-Cheat (Option Order)

- **Problem:** `AnswerOption.order` in the DB is static; if the correct option is always stored first (common in seed/manual entry), players can guess without reading.
- **Do not** rely on ?random UI only? long term ? refresh or inconsistent reads could change behavior unless order is session-bound.
- **Interim (acceptable short-term):** shuffle options in the server layer when building the public quiz DTO; validate answers by `option.id`, not by index in the form.
- **Final (recommended):** at `QuizSession` creation:
  1. Pick the exact question set for this session.
  2. For each question, shuffle options **once** and persist display order in a session snapshot.
  3. Store via `QuizSessionQuestion` + `QuizSessionQuestionOption` (relational, preferred for queries/integrity) **or** a JSON snapshot on `QuizSession`.
  4. Quiz page and `submitQuizAction` / scoring must read **only** from that snapshot for that `sessionId`.
- Session snapshot fixes both stability (pool edits) and anti-cheat (per-session shuffled order).
- Admin create/edit may keep canonical `order` in `AnswerOption`; shuffle applies at **session start**, not when saving questions.

## Quiz Variety And Question Selection

**Decision:** question variety should be handled at quiz session creation, not by randomizing on every render.

Current problem:

- `findActivePublicByDifficulty()` and `findActiveForScoring()` use deterministic `createdAt` order.
- New sessions with the same difficulty/count can show the same questions repeatedly.
- Because the selected question ids are not persisted, admin edits/deactivations during an active session can affect what the user sees or what gets scored.

Recommended behavior:

- At `startQuizAction`, choose the exact question set once.
- Persist the selected question ids and their display positions in a session snapshot.
- Shuffle answer options once and persist their display order.
- Quiz page, refresh, and submit/scoring must read from the same snapshot.

Professional implementation options:

- Small/medium question bank: query eligible ids and shuffle in the server layer, then take `questionCount`. This is simple, testable, and good for MVP scale.
- Larger bank later: use a database-assisted random strategy or precomputed random keys. Avoid blindly relying on expensive `ORDER BY RANDOM()` on very large tables.
- Advanced later: reduce repeats per user by excluding recently seen question ids from their last N sessions, but do not add this before the basic snapshot exists.

What not to do:

- Do not shuffle only in a Client Component.
- Do not reshuffle on every page refresh.
- Do not score against a freshly selected active question pool.
- Do not trust client-submitted question order, correct answer, score, or timing.

Timing:

- Implement this **before** adding timed modes, daily challenges, category filters, achievements, or portfolio-level UI polish.
- This is a core product correctness feature, not cosmetic polish.

**Landed follow-up (Aug 12):** per-user anti-repeat for Classic/Timed is **User Question Cycle (seeded cursor)** — see next section. Snapshot still freezes the chosen ids for the session; cycle only chooses which ids enter the snapshot.

## User Question Cycle (seeded cursor)

**Status:** landed Aug 12, 2026 (`a84ebdb` transport + `382f795` boundary).  
**Product:** Classic + Timed share one bag per `userId + difficulty`. Daily Challenge stays on frozen day ids (no cycle).

### Problem history

1. **JSONB `remainingIds` bag (Prisma)** — UPDATE of ~100 ids hung >4s on Windows+Neon → `Promise.race` budget → silent fallback to `ORDER BY RANDOM` pick → IMAGE_GUESS «преследовали», мешок не списывался; zombie UPDATE after abort.
2. **Cycle on Direct quiz queue** — long hop / timeout wedged `withDirectPgQueue` (home/submit suffered).
3. **Seeded cursor + Prisma scalars** — SQL/COMMIT often OK, then Prisma pooled adapter `Connection terminated` on teardown → `mapQuizStartError` → false `DB_TIMEOUT`, session not created.

### Decision

| Piece | Choice |
|-------|--------|
| State in DB | Scalars only: `cycleNumber`, `cycleSeed`, `cursor`, `poolSize` (migration `20260812160000_user_question_cycle_seed_cursor`) |
| Pure draw | `drawFromSeededCycle` — deterministic shuffle from seed; Vitest covers wrap |
| Boundary | **Reshuffle-first** when `remaining < needed` (хвост returns to bag). **Not** drain-then-top-up (that re-drew wrap ids later in the same cycle when `pool % questionCount ≠ 0`) |
| Persistence | `user-question-cycle.repository.ts` via **`withPooledPgClient`** (fresh raw `pg` on `DATABASE_URL`, **outside** Direct queue); optimistic UPDATE; transient after UPDATE → verify `nextState` |
| Pick wiring | `pickClassicSnapshotBundle` / `pickTimedSnapshotBundle` → cycle ids → `pickSnapshotBundleByQuestionIds` (chunk 5). **No** silent random fallback |
| Errors | Transient → `DB_TIMEOUT`; insufficient pool → `NOT_ENOUGH_QUESTIONS` |

### Do not

- Put cycle on `withDirectPgClient` / `withDirectPgWriteClient` / `withDirectPgQuizStartClient`.
- Put cycle back on Prisma for quiz start.
- Raise global Direct/Prisma timeouts or re-enable keep-warm to “fix” cycle.
- Restore JSONB remaining bag or Promise.race budget that abandons in-flight UPDATE.
- Restore silent random fallback when cycle fails.
- Restore drain-then-top-up on the cycle boundary.
- Touch cycle from Daily start or from submit/complete.

### Code

- Pure: `src/entities/user-question-cycle/draw-from-question-cycle.ts` (+ `.test.ts`)
- Repo: `src/entities/user-question-cycle/user-question-cycle.repository.ts`
- Helper: `withPooledPgClient` in `src/lib/db/direct-pg.ts`
- Pick: `src/features/quiz/lib/pick-quiz-snapshot-bundle.ts`

## UI/UX Timing And Theme Quality

**Decision:** UI/UX polish should start after the quiz core is stable enough that flows will not be rewritten immediately.

Recommended timing:

1. First stabilize quiz sessions: persisted question ids, option order, server-side scoring from snapshot.
2. Then implement content i18n and enough question-bank/admin improvements to know real UI needs.
3. Start visual polish in parallel with admin/question-bank work, but keep it incremental.
4. **Full visual identity pass via Taste Skill** ? only after Post-Launch UX Slice (?11.1?11.5) is live; see **Taste Skill Visual Identity** below.

Theme guidance:

- Use CSS variables/design tokens for background, foreground, muted text, surfaces, borders, focus rings, danger/success/warning, and interactive states.
- Light and dark themes should be designed separately; do not rely only on inverted colors.
- Keep tokens semantic (`--color-surface`, `--color-border`, `--color-primary`) rather than component-specific too early.

Responsive guidance:

- Prioritize the main flows first: auth, quiz setup, quiz session, result, leaderboard, admin question list/form.
- Mobile should not be an afterthought because quiz apps are likely used on phones.
- Tables in admin may need responsive alternatives: horizontal scroll for MVP, card/list layout later if needed.

Accessibility basics:

- Visible focus states.
- Real labels for form controls.
- Error messages tied to inputs where possible.
- Sufficient contrast in both themes.

## Taste Skill Visual Identity (July 17, 2026)

**Context:** Developer is not a designer; wants original, high-quality UI/UX for GameMind that **keeps improving as the product grows**. Tooling: [Taste Skill](https://www.tasteskill.dev/) ([GitHub](https://github.com/Leonxlnx/taste-skill)).

**Decision (two layers):**

1. **Foundation pass (?11.8)** ? audit-first redesign of existing surfaces after Post-Launch UX Slice (?11.1?11.5) is on prod, before Phase 5 modes invent layouts without a system.
2. **Ongoing discipline** ? after the design system is locked, **every** new screen/feature UI extends that lock under Taste rules. Continuity + prompts + visual change log: **`docs/TASTE_SKILL.md`**. Cursor bridge skill: `.cursor/skills/gamemind-taste-ui`.

Taste Skill is therefore both a milestone and a permanent way of working on UI ? not a one-off polish week.

### Why foundation timing (not earlier, not later)

| Too early | Right window for foundation | Too late for foundation |
|-----------|-----------------------------|-------------------------|
| Mid Epic 4?5: profile/admin still gaining sections ? redesign churn | Primary surfaces exist on `www.game-mind.ru` incl. avatar + admin users | Phase 5 modes ship as generic UI; expensive retrofit |
| During Neon/hot-path debugging | Quiz core + i18n + media + live deploy stable | ?Polish forever? with no system while features pile up |

**Before foundation:** finish product epics with functional UI on existing tokens; log intentional visual notes in `TASTE_SKILL.md` if useful. Do not run Wave A/B yet.

**After foundation:** use Prompt T-Feature for new UI; append ?7 change log every visual session.

Also: do **not** mix Taste UI work with ?11.7 repository splits in the same session/PR.

### Which skills to install / use

Primary stack for GameMind (existing app, not greenfield landing):

1. **`redesign-existing-projects`** ? **mandatory for foundation.** Audit first.
2. **`design-taste-frontend`** (v2) ? dials + anti-slop during implementation and ongoing features.
3. Optional: **one** of `high-end-visual-design` or `minimalist-ui` after direction is chosen.
4. Optional comps: `imagegen-frontend-web` / `brandkit`.
5. `full-output-enforcement` only if the agent truncates.

Install:

```bash
npx skills add https://github.com/Leonxlnx/taste-skill --skill "redesign-existing-projects"
npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"
```

Pin v1 only if v2 breaks something: `--skill "design-taste-frontend-v1"`.

Suggested dials (finalize in `TASTE_SKILL.md` ?4 after audit):

- **DESIGN_VARIANCE:** ~4?6
- **MOTION_INTENSITY:** ~3?5 overall; quiz answering stays calmer
- **VISUAL_DENSITY:** ~4?5 public; admin denser ~6?7

### Hard constraints (must survive redesign and ongoing UI)

Taste Skill changes **presentation**, not domain architecture.

- Keep App Router + feature-based folders.
- Keep semantic CSS variables + `data-theme`; extend tokens ? no second theme system.
- Keep locale dictionaries; no hardcoded UI strings.
- Server Components default; Client only for interactivity.
- Do **not** move Prisma / direct `pg` / Server Actions into client code for prettier UI.
- Do **not** change quiz snapshot, scoring, or Neon write paths in visual PRs.
- Preserve IMAGE_GUESS full-frame (no cropped 16:9 `object-cover`).
- Preserve role-aware header + server auth guards.
- Prefer `globals.css` + `src/shared/ui` primitives over one-off page CSS.
- After each visual session: update `docs/TASTE_SKILL.md` ?7 Change log.

### Foundation execution order (?11.8)

1. Install skills + ensure `gamemind-taste-ui` project skill is available.
2. Prompt T-Audit ? paste into `TASTE_SKILL.md` ?6.
3. Lock design system in ?4; implement tokens/fonts first.
4. Wave A public flows ? redeploy + smoke.
5. Wave B profile + admin ? a11y ? redeploy + smoke. (**done on prod** 2026-07-22 ? user-verified)
6. Status = **ongoing**; all later UI uses Prompt T-Feature.

Full prompts: `docs/TASTE_SKILL.md` ?9.

### Anti-patterns

- Foundation while Epic 4+5 still unfinished on prod (~~cleared July 18~~ ? both live).
- One giant PR restyling everything + refactoring repositories.
- New features inventing one-off colors after lock exists.
- Purple-gradient / generic SaaS look.
- Heavy motion on quiz answer screen.
- Skipping the change log so future chats lose visual decisions.

### Relationship to existing Phase 4 work

Partial Phase 4 already shipped (tokens, `QuestionCard`, progress, role-aware header, result review, admin hub). Foundation is the **coherent identity pass**; ongoing Taste discipline keeps Phase 5+ from regressing to slop. **?11.9 perceived performance** (loaders/pending UI) can start before foundation; visual styling of those states should follow the lock once waves run.

## Perceived Performance And Smooth Interaction (July 18, 2026)

**Context:** After Epic 5, local navigation sometimes feels like a ?missed click? ? usually Turbopack first-compile or RSC waiting on Neon, not a broken `onClick`. Partial loaders already exist on admin routes.

**Decision:** track a dedicated checklist **`ROADMAP.md` ?11.9** (and Epic 8 in `PROJECT_CONTEXT.md`) so loaders, skeletons, Link/Action pending UI, lazy media, and careful memoization are not forgotten. This is **interaction quality**, complementary to Taste Skill brand (?11.8).

**Order:**

1. ~~Redeploy Epic 4+5~~ ? **done** July 18 evening; user-verified on prod.
2. ~~Ship light ?11.9~~ ? **done** July 18 night (`PageSkeleton`, `PendingLink`, `SubmitButton`).
3. Full ?11.9 remainder with or just before ?11.8 Wave A/B so skeleton/pending visuals match the design lock.
4. ?11.8 Taste foundation ? **Wave A + Wave B on prod** (2026-07-22 smoke OK); Status = **ongoing**.

**Rules:**

- Prefer honest pending UI over infinite spinners.
- Keep Neon fail-fast + retry; do not remove timeouts to ?feel faster?.
- No premature blanket `useMemo` ? measure first; Server Components by default.
- Respect `prefers-reduced-motion`; keep quiz answering calm.

## Product Expansion Order

Recommended sequence after MVP hardening:

0. **First public deploy** (Vercel + Neon + `public/` images + owned domain) ? learning + friends demo (see Public Deploy decision).
1. Question bank quality + admin filters/search, deactivate/archive, draft/review/publish.
2. ~~Full content i18n~~ (done).
3. ~~Question media MVP~~ (done ? local WebP); **admin quiz upload + Avatar Phase B** via RU-first storage (Vercel Blob + `/media`; Yandex fallback) ? not R2-by-default.
4. ~~Profile and result history~~ (**on prod** July 18); Avatar Phase B when ready.
5. ~~Admin users~~ (**on prod** July 18).
6. **?11.9 Perceived performance** (loaders / skeletons / pending UI) ? light anytime; full pass with Taste.
7. **Taste Skill (?11.8 foundation + ongoing UI discipline)** ? **unblocked** (11.1?11.5 on prod). Source of truth: `docs/TASTE_SKILL.md`.
8. Better leaderboards: by difficulty/category/period.
9. Daily challenge: strong portfolio feature because it combines scheduling, fair shared question set, and leaderboard.
10. Timed/survival/mixed modes.
11. Achievements.
12. API-assisted question drafts with admin review.

Strong quiz mode candidates:

- Classic: current mode, fixed number of questions.
- Timed challenge: answer as many as possible in a time window.
- Daily challenge: same daily snapshot for all users, leaderboard by date.
- Survival/streak: continue until a wrong answer.
- Category/platform/genre quiz: user chooses filters.
- Mixed difficulty: score weights differ by difficulty.

Avoid implementing many modes before the shared session snapshot is stable. Most modes should reuse the same underlying session/question/answer/result model.

## Public Deploy And Hosting (July 14, 2026)

**Decision:** deploy a showable MVP **now**, keep coding locally, re-deploy milestones. Do not wait for polish/CDN before the first public URL.

**v1 stack**

- Host: Vercel Hobby
- DB: Neon (dedicated production project/branch preferred over sharing only the local-dev DB forever)
- Media v1: WebP in `public/quiz-images/` (same origin)
- Domain: owned domain pointed at Vercel; Cloudflare Free DNS + proxy was historically recommended ? status of grey vs orange for `game-mind.ru` is currently **unknown** from RU without VPN; do not couple media CDN to CF
- Later media uploads: **Vercel Blob + same-origin `/media`** (primary); **Yandex Object Storage** (fallback). **Cloudflare R2 demoted** for RU-first audience/ops (see Media Storage And Upload ADR)

**Why not Blob/R2 on day one (historical ? still valid for first launch)**

- First launch was blocked by host + env + auth + domain, not by object storage
- Seed image volume fits git/`public/`
- Architecture already stores URL-only assets; object storage plugs in without schema redesign

**Why not R2 as the post-launch default (2026-07-22)**

- CF Dashboard often unreachable from RU without VPN
- CF public delivery is high risk for primary RU audience
- Same-origin on `game-mind.ru` is already proven for IMAGE_GUESS

**Domain**

- Domain is DNS identity, not hosting
- After `*.vercel.app` works: attach domain in Vercel, set DNS, set `AUTH_URL`/`NEXTAUTH_URL` to `https://domain`
- Custom domain enables portable branding if the host changes later

**RF / friends access**

- Prefer custom domain (already: `www.game-mind.ru` via REG.RU ? Vercel) if `*.vercel.app` is flaky
- Escalate to Railway/VPS only after that still fails ? not as the first host choice for this Next.js app
- Do **not** assume Cloudflare orange proxy is required or safe for RU media delivery

**Secrets / ops**

- Never commit `.env`
- Production needs: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `AUTH_SECRET`, domain `AUTH_URL`
- Keep ADMIN credentials private for demo audiences

Full checklist: `PROJECT_CONTEXT.md` ? Public Deploy Plan; tracking boxes in `ROADMAP.md` ? Immediate Next Step.

## Leaderboard

- Public page; no `requireUser()`.
- MVP rule: one row per user = their best `QuizResult.score`; tie-break by earlier `completedAt`.
- **`findBestScores(limit)` (July 16, 2026 evening):** unpooled `withDirectPgClient` + SQL `DISTINCT ON ("userId")` ordered by score DESC / completedAt ASC, then JOIN `User`, global `ORDER BY` + `LIMIT`. Replaced Prisma `distinct` + in-memory sort after the same Neon hang class as admin/quiz.
- Do not regress to Prisma on this path without re-measuring Windows + Neon.
- `LeaderboardEntry` DTO is mapped in the feature layer; UI does not depend on DB row shape.
- Current UI shows points + `correctCount / totalQuestions` + completion date.
- Keep `LeaderboardEntry.completedAt` even if presentation changes; it supports tie-break explanation.
- **Difficulty filter (July 29, 2026):** optional URL `?difficulty=EASY|MEDIUM|HARD` (omit/`all` = global). Zod `parseLeaderboardFilters` (safe defaults; unit-tested). `findBestScores(limit, filters?)`: unfiltered path unchanged (no `QuizSession` JOIN); filtered path JOIN `QuizSession` + `WHERE s.difficulty = $2` then same DISTINCT ON ? best **within** session difficulty. Filter by **`QuizSession.difficulty`**, never live `Question.difficulty`. UI: Scoreboard **segmented control** + eyebrow (not 2?2 CTA grid); `PendingLink`; `emptyFiltered` copy.
- **Period filter (July 29, 2026 late):** optional URL `?period=week|month` (omit/`all` = all-time). **Rolling** windows (7?24h / 30?24h), not calendar week/month ? simpler UX and no timezone ?whose Monday?. Feature `getLeaderboardPeriodCutoff` ? repo `completedAfter: Date | null` (entity does not know week/month words). JOIN Session **only** when difficulty is set; period-only filters `QuizResult.completedAt` without Session JOIN. Zod per-field `.catch` so a bad `difficulty` does not wipe a valid `period` (and vice versa). UI: second segmented control above difficulty; both query params preserved when switching either filter. Later: category boards without rewriting this contract.

## Admin Panel

- List, create, and delete implemented at `/:locale/admin/questions` (+ `/new`).
- Edit implemented at `/:locale/admin/questions/[id]/edit` with existing options update by `id`.
- Access: `requireAdmin()` on pages and Server Actions; `proxy.ts` for route guard.
- List: `findAllForAdmin()` + `mapAdminQuestions` ? `AdminQuestionListItem`.
- Create: `createQuestionSchema`, `createQuestionAction`, `AdminQuestionForm`, `createWithOptions`; `revalidatePath` on success. After `IMAGE_GUESS` added `QuestionAsset`, create moved from Prisma nested create to one idempotent direct `pg` CTE because Prisma reproduced the old Neon socket failure (`not queryable`, rollback, ~90s wait).
- Delete: `deleteQuestionAction`, `deleteById`; Prisma cascade removes options and related `QuizAnswer`.
- Deactivate/activate: `deactivateQuestionAction`, `activateQuestionAction`, `deactivateById`, `activateById`; `isActive` toggles visibility in quiz (`findActive*` filters `isActive: true`). Deactivate is the preferred soft removal; hard delete remains for cleanup.
- **Bulk isActive (July 28, 2026, committed `137bc4d`):** `deactivateManyByIds` / `activateManyByIds` ? one unpooled `UPDATE ? WHERE id = ANY($2::text[]) AND "isActive" = opposite` (idempotent); cap 100 via `normalizeBulkQuestionIds` / `parseBulkQuestionIdsFromFormData`; Server Actions `deactivateQuestionsBulkAction` / `activateQuestionsBulkAction` + `requireAdmin`; UI checkboxes + toolbar on `AdminQuestionsTable` (Client). Full invalidate list-cache when `updatedCount > 0`. **Do not on this path:** hard-delete bulk, users bulk, Prisma `$transaction` loops, or `BEGIN/COMMIT`. Publication bulk is a separate later slice (July 29).
- **Bulk publication (July 29, 2026, local):** `submitForReviewManyByIds` / `publishManyByIds` ? one unpooled `UPDATE` + status allowlist (`DRAFT?IN_REVIEW`; `DRAFT|IN_REVIEW?PUBLISHED`); `BulkPublicationMutationResult`. Server Actions run sequential quality gate (`collectEligibleBulkPublicationIds` + `getQuestionPublishQualityIssues`); partial success OK; first blocker ? edit `PUBLISH_QUALITY_BLOCKED`. UI: contextual toolbar via pure `getBulkToolbarCapabilities` (hide inapplicable CTAs; groups Visibility / Publication); forms send only eligible ids; reset `bulkPending` on selection status fingerprint (+ 8s failsafe) so soft-redirect does not leave buttons stuck disabled. **Do not:** bulk return-to-draft; hard-delete bulk; skip quality gate; parallel Neon TLS for per-id quality reads without measuring.
- Idempotent status toggle: repository checks current `isActive` before write; if already in target state ? no DB update, silent success redirect; if question missing ? `?error=NOT_FOUND`; DB failure ? `DEACTIVATE_FAILED` / `ACTIVATE_FAILED`.
- Server Action redirect rule: `redirect()` must not be called inside a broad DB `try/catch`, because Next.js redirects are thrown exceptions. DB errors are caught first; redirects based on result status happen after the `try/catch`.
- UI: active rows show Deactivate (amber); inactive rows show Activate (green); Delete always available.
- Edit: `findByIdForAdmin`, `updateQuestionSchema`, `updateQuestionAction`, `updateWithOptions`; `AdminQuestionForm` supports `mode="edit"` with `initialValues`.
- Errors: `AdminErrorCode` + `dictionary.admin.errors` + `getAdminErrorMessage` (`deactivateFailed`, `activateFailed`).
- Writes: admin create/edit/status/delete use direct `pg` + `DATABASE_URL_UNPOOLED` (create/edit: one bulk CTE; deactivate/activate/delete: simple SELECT+UPDATE/DELETE). Cascade delete relies on DB FKs from Prisma schema.
- Admin list/detail reads use **unpooled** `pg` (`withDirectPgClient` + `DATABASE_URL_UNPOOLED`) with a 30s wall-clock attempt timeout (2 attempts) and `client.end()` abort. Do **not** put admin list on pooled URL with a tight ~12s budget ? that regression made every admin GET fail at ~24s with `loadFailed` while quiz unpooled stayed healthy. Prefer matching admin reads to the proven quiz unpooled path.
- Do not add `SET statement_timeout` on every admin read; wall-clock `Promise.race` is enough and avoids an extra round-trip.
- Admin edit became a proven fragile Neon/Windows write path after content i18n added many translation upserts. The save flow uses direct `pg` + one bulk SQL CTE instead of many sequential Prisma/direct queries.
- Do not reintroduce parallel `client.query()` calls on the same `pg.Client`; `node-pg` clients are single-connection and the previous `Promise.all` upserts caused mid-save socket resets.
- Do not await Prisma `pool.end()` / `$disconnect` inside `withDatabaseRetry` reset ? fire-and-forget (same trap as quiz `client.end()` ~19s).
- After many timed-out admin connects in one `next dev` process, restart the dev server to clear wedged sockets.
- **Admin list filters/search (July 23, 2026; page Aug 4):** filters live in URL (`status`, `difficulty`, `type`, `q`, `page`); Zod parse with safe defaults; SQL WHERE on unpooled `findAllForAdmin(locale, filters?)`. Search uses literal `position(lower(...))` across legacy `Question.text` + all `QuestionTranslation` rows (both locales). Auto-apply Client UI; omit `all`/empty/`page=1` from URL. List DTO includes `type` + `promptImageUrl` for IMAGE_GUESS previews. Language switcher preserves query string. URL `status` still means `isActive` only; publication is a separate field; `page` is offset pagination (25/page).
- **Question publicationStatus (July 26, 2026):** enum `DRAFT | IN_REVIEW | PUBLISHED` orthogonal to `isActive`. Quiz pool = `isActive AND PUBLISHED`. Create ? `DRAFT`; edit text does not change status; repo transitions (idempotent / invalid_transition). Existing rows backfilled `PUBLISHED`. Seed writes `PUBLISHED`. List + edit-page Server Actions/UI/i18n + URL filter `publication` done; **prod migration + smoke OK July 27**.
- **Admin unfiltered list (July 26 hang update; superseded Aug 4 for pagination):** full-list / Reset hung (~24s) while `?difficulty=` / `?type=` stayed healthy. `WHERE true` and `UNION ALL` both hung in next+Neon when returning **all** rows. **Aug 4:** paginated path is `COUNT` + `LIMIT/OFFSET` (25/page) — do not bring back unbounded SELECT or 3× over-fetch by page (page≥3 timed out). Hard-nav + pending spinner for page changes.
- **Admin list locale text (July 26 night):** failed experiment: separate queued `QuestionTranslation` overlay read reintroduced Neon hangs and broke filters. Final rule: list text is selected in the **main list SELECT**. RU uses `Question.text` (ru cache); EN uses a scalar subquery `QuestionTranslation(en)` with fallback to `Question.text`; cache key includes locale. Do not reintroduce translation JOIN, second query on same client after list, or a second queued translation read.
- **Admin publication URL filter (July 26 late):** `?publication=DRAFT|IN_REVIEW|PUBLISHED`. Allowlisted inline enum in WHERE (no `$1` on list SELECT). With pagination, a single COUNT/LIMIT query may include `publication` (and other filters) without requiring 3× difficulty chunks — still do not run unbounded full-table list SELECTs.
- **Bulk isActive:** shipped July 28 (`137bc4d`). **Bulk publication + contextual toolbar:** shipped July 29. **Admin list pagination:** shipped Aug 4 (verified).

## Question publication workflow (July 26, 2026)

**Decision:** two axes on `Question`:

| Field | Role |
|-------|------|
| `publicationStatus` | content lifecycle: DRAFT ? IN_REVIEW ? PUBLISHED (solo admin may DRAFT ? PUBLISHED) |
| `isActive` | soft-hide / archive; false excludes from quiz even if PUBLISHED |

**Quiz pool:** `isActive = true AND publicationStatus = 'PUBLISHED'`.

**Transitions:** idempotent no-op if already target; otherwise allow DRAFT?IN_REVIEW|PUBLISHED, IN_REVIEW?PUBLISHED|DRAFT, PUBLISHED?DRAFT only.

**Why not replace isActive:** existing admin filters/actions/hub counts already use `isActive`; merging into one enum would be a large breaking change for little gain.

**Do not:** put drafts in quiz pick; change status on content edit; use one full-table admin list SELECT in next+Neon without measuring.

**Admin list UI:** desktop questions list should stay a **content queue**, not a wide spreadsheet. Keep the row focused on Question + meta, lifecycle, date, actions. IMAGE_GUESS previews may be larger than text icons, but use `object-contain` and do not turn the table into a gallery. Edit page has a separate publication panel (badge + allowed transitions; `returnTo=edit`). **Desktop Actions (July 27):** only Edit + ????? (`<details>`); publication/isActive/delete inside menu; forward CTAs exclusive (DRAFT?submit for review; IN_REVIEW?publish). After publication/isActive mutate, **patch** the TTL list-cache row (do not full-invalidate unless status/publication URL filter is active) ? avoids 3?SELECT on every workflow click.

### Publish quality gate (July 27, 2026)

**Decision:** before `publish` / `submitForReview`, run pure `getQuestionPublishQualityIssues` on the current admin detail snapshot.

| Severity | Examples | Behavior |
|----------|----------|----------|
| **blocker** | missing RU/EN text, &lt;2 options, ?1 correct, IMAGE_GUESS without prompt, duplicate option text in a locale | Server Action redirects to edit `?error=PUBLISH_QUALITY_BLOCKED`; status unchanged |
| **warning** | RU?EN question/option text; `isActive=false` | Shown on edit; publish still allowed |

**Why:** draft workflow is live; without a gate, drafts with broken options can enter the quiz pool. Pure function keeps rules testable without Neon; UI is presentation-only; real enforcement is in Server Actions (same pattern as scoring ? never trust the client alone).

**Create vs publish:** Zod on create/update still rejects IMAGE_GUESS without image (`INVALID_INPUT`). That is save validation, not the publication gate. Gate covers cases that can be saved as DRAFT but must not go live (e.g. duplicate options).

**Form UX:** admin create/edit fields are controlled ? React 19 resets uncontrolled form inputs after a failed Server Action.

**Do not:** gate `returnToDraft`; block on warnings-only; put quality SQL on the admin list hang queue; change quiz pool rules beyond existing `isActive + PUBLISHED`.

**Shipped:** committed `dfd57b1`; Vitest suite for pure quality fn (Phase A). Bulk isActive later shipped `137bc4d` (orthogonal axis). Bulk publication (July 29) reuses the same pure gate before multi-id UPDATE.

## Automated Testing Adoption (July 27, 2026)

**Decision:** introduce automated tests **incrementally**, starting with **Vitest unit tests** for pure domain rules. First target: `getQuestionPublishQualityIssues` (publish quality gate). Treat the developer as a **complete beginner** ? learning is a first-class goal of the track, not an afterthought.

**Phased plan (source of truth):** `docs/TESTING.md`.

| Phase | What | Why first / later |
|-------|------|-------------------|
| **A** | Vitest + quality unit tests | No Neon; teaches AAA; locks publish gate rules |
| **B** | More pure units (scoring, filter parse, ?) | Expand only after A is comfortable |
| **C** | Keep `scripts/smoke-*.cjs` as Neon integration | Already fit fragile Windows+Neon paths |
| **D** | Optional Playwright (1?2 flows) | Needs fixtures/DB; after unit literacy |
| **E** | Optional CI `npm run test` | Only when local unit suite is boringly green |

**Why Vitest (not Jest first):** modern TS/Vite ecosystem fit; simple DX; enough for this repo.

**Why not Playwright first:** higher setup cost; flakiness; beginner overload. Manual browser smoke remains for UX gates until D.

**Do not:** chase 100% coverage; unit-test Neon hang paths without a stable harness; mix Taste UI refactors into the testing learning chat; weaken server-side publish/scoring gates because ?tests exist?.

**Status (July 28):** Phases A?C + **E** done. **29** unit tests green locally; CI workflow `.github/workflows/test.yml` (`npm ci` + `npm run test`, no Neon/secrets) committed `e68f532`; Actions run #1 **success**. **Next testing (optional):** Phase D Playwright. Product next: prod redeploy/smoke, etc.

**Prompt:** `AGENTS.md` ? **Prompt V** (Vitest learning); Phase E CI shipped ? do not re-open unless changing the workflow.

## Quiz Setup Route (July 16, 2026)

**Decision:** Quiz setup lives at `/:locale/quiz` (`src/app/[locale]/(public)/quiz/page.tsx`), not `/quiz/setup`.

**Why:** Next.js 16 App Router treated sibling `quiz/setup` + `quiz/[sessionId]` as a conflict and returned **404** for both routes (including the known Turbopack/dev case where `/quiz/setup` was swallowed by `[sessionId]`). Moving setup to the segment root removes the clash.

**Also:** `proxy.ts` redirects legacy `/:locale/quiz/setup` ? `/:locale/quiz`. Nav, result ?Play again?, and `startQuizAction` error redirect use `/quiz`.

**Do not:** reintroduce a static child named `setup` under `quiz/` next to `[sessionId]`.

## Repository File Split (July 16, 2026)

**Status (July 27, 2026):** both planned entity splits **done** and committed (move-only).

- `question.repository` ? types + quiz-pick + admin + thin facade (July 26; `6c663e6`).
- `quiz-session.repository` ? types + snapshot helpers + start + submit + reads + thin facade (July 27; `34a00d2`). Stable import `@/entities/quiz-session/quiz-session.repository`. Relational create kept inside start module (no separate `*-relational-legacy` file). `buildValuesPlaceholder` still duplicated start/submit (tidy later if desired).

**Original decision:** defer splitting until after Post-Launch UX (or before a new quiz mode). Size alone is not a bug; split by **scenario**, not line count.

**How (followed)**

1. Split by scenario (admin vs quiz pick; start vs submit vs reads).
2. Thin facade ? feature imports stay stable.
3. Move first ? no SQL/behavior rewrites in the same change.
4. Order: `question` first, then `quiz-session`; optional auth module-graph split still open.

**Anti-patterns**

- Mixing Neon SQL rewrites with mechanical file moves.
- Breaking public repository method names used by Server Actions.
- Splitting during Taste Skill redesign waves or mid-feature.

Tracking: `PROJECT_CONTEXT.md` ? Deferred Code Refactoring; `ROADMAP.md` ?11.7.

## Post-Launch UX Slice (July 15, 2026)

**Context:** App is live on Vercel + Neon prod + `www.game-mind.ru`. Next work is UX/account/admin hardening, not greenfield architecture.

### Auto sign-in after register

**Decision:** After successful `userRepository.create`, call `signIn('credentials', { email, password, redirectTo: \`/${locale}\` })` inside `registerAction` (mirror `loginAction`). Redirect to **home**, not profile.

**Why:** Double credential entry is the worst first impression; Auth.js supports signing in with the same credentials just submitted.

**Risks:** `signIn` throws on redirect ? same try/catch pattern as login (`AuthError` vs redirect). Do not catch redirects as failures.

### Result answer review

**Decision:** Show per-question review on the result page for the **session owner only**, driven by **frozen snapshot + QuizAnswer**, not live question bank. **Shipped July 16, 2026.**

**Why:** Learning loop; data already stored; aligns with anti-cheat snapshot model.

**UI:** Summary on top; list below; default filter Wrong; IMAGE_GUESS thumbnails from snapshot `imageUrl`.

**Anti-patterns:** Public result URLs without auth token; re-fetching live `Question` for review text; client-computed ?wasCorrect?.

### Weighted scoring

**Decision:** `score` = weighted points; `correctCount` = number correct. MVP weights: EASY=1, MEDIUM=2, HARD=3 (constants in `features/quiz/lib/scoring.ts`).

**Status (July 16, 2026):** **shipped to production** and smoke-verified. Snapshot already had per-question `difficulty`; submit maps it into scoring; result UI uses `getMaxPossibleScore` from review payload; leaderboard shows points (not `score / totalQuestions`). No migration; no historical backfill.

**Why:** Leaderboard ?best score? becomes meaningful when HARD vs EASY sessions (and later mixed difficulty) appear; keep `correctCount` for accuracy UX.

**Schema:** Prefer extending snapshot with per-question `difficulty` if missing; avoid new DB columns until needed (`maxPossibleScore` can be computed). Do not backfill old results unless product asks.

**Leaderboard:** Continue sorting by `score`; labels = ?points? / ??????.

**Next after this:** mixed-difficulty quiz mode (optional); Epic 4 profile (history + password done locally July 16 evening).

### Profile password & avatar

**Decision:**

- Password change requires **current password** + new + confirm (no email reset until mailer exists).
- Avatar: use existing `User.image` URL field; production uploads via **shared RU-first storage** (Vercel Blob + `/media/avatars/...`; Yandex fallback) ? **not** Cloudflare R2 by default; URL-only interim acceptable for learning/MVP.
- Profile also gains **result history** (read path on `QuizResult` by `userId`) ? high value.

**Status (July 18, 2026 late evening):** interim avatar **on prod** (user-verified). History + password + username + header/profile `UserAvatar` (`object-cover`). Clear-avatar requires `startTransition`. Avatar Phase B (RU-first storage upload) planned below ? not started.

**Neon path:** password change uses `userRepository.changePasswordHash` ? one `withDirectPgWriteRetry` (SELECT hash ? bcrypt in JS ? UPDATE). Username uses `userRepository.updateUsername` (same write helper; map PG `23505` ? taken). Avatar uses `userRepository.updateImage` (same helper; `''` ? SQL `NULL`). Profile history and leaderboard use `withDirectPgClient`. Do not put these back on Prisma after hang reproduction.

**JWT / UI after username or avatar change:** call Auth.js `unstable_update({ user: { ? } })` and handle `trigger === 'update'` in the `jwt` callback (`username` and/or `image` ? `token.picture`). Soft `revalidatePath` alone is not enough ? client `router.refresh()`. Return the new `username` / `imageUrl` in action state and depend on it in `useEffect` (not only `success`). Clear-avatar `formAction(FormData)` must run inside `startTransition`.

**Display rule (interim and forever for UI):** circular avatars use **`object-cover` + center** (fill the circle). Do **not** use `object-contain` for avatars (letterboxing looks broken). This is unrelated to quiz IMAGE_GUESS, which stays full-frame contain-style.

**Security:** `requireUser()` on all profile mutations; never return `passwordHash`; validate upload type/size on server when Phase B ships; no SVG avatars; username uniqueness enforced in DB.

**Next after interim avatar:** ?11.9 light polish and/or Avatar Phase B; ?11.8 Taste foundation; rate limiting auth + password/username/avatar change.

## Media Storage And Upload (RU-first) ? July 22?23, 2026

**Decision (approved):** for GameMind production uploads (quiz images + avatars), **do not** use Cloudflare R2 as the default. Audience is primarily Russia; measured facts supersede the older ?R2 preferred? notes.

### Measured facts (2026-07-22, RU, no VPN)

1. Primary audience: RU (developer + friends). Global portfolio traffic is secondary.
2. Prod app `https://www.game-mind.ru` opens without VPN.
3. Same-origin static IMAGE_GUESS works without VPN, e.g. `https://www.game-mind.ru/quiz-images/easy/super-mario-bros.webp`.
4. `https://dash.cloudflare.com` does **not** open reliably without VPN ? daily CF Dashboard ops is unacceptable.
5. Public delivery via Cloudflare network (R2 public URL, `*.r2.dev`, orange-proxied custom domain) is **high risk** for RU users. Grey vs orange DNS for `game-mind.ru` is currently **unknown** (dashboard blocked) ? do **not** assume CF proxy is safe.
6. Server Action upload path (Vercel ? storage) does **not** prove browser download from RU. Delivery must be smoke-tested separately.

### Choice

| Role | Provider | Public URL strategy |
|------|----------|---------------------|
| **Primary** | **Vercel Blob** | Same-origin paths under `https://www.game-mind.ru/media/...` (Next rewrite to Blob). Prefer **relative** URLs in DB: `/media/quiz/...`, `/media/avatars/...`. |
| **Fallback** | **Yandex Object Storage** (S3 API; optional Yandex CDN later) | Same adapter; same `/media/...` public contract if possible, or Yandex public HTTPS after RU smoke. |
| **Demoted / reject as default** | **Cloudflare R2** | Only after explicit RU-no-VPN smoke on 2?3 ISPs proves delivery + ops without CF Dashboard dependency. |
| **Baseline (keep)** | `public/quiz-images/**` in git on Vercel | Seed / existing IMAGE_GUESS; never required to migrate off this path. |

### Why this primary

- Browser delivery class already **proven** for same-origin on `game-mind.ru`.
- Ops/payment stay on **Vercel** (already used for deploy) ? no Cloudflare Dashboard for day-to-day uploads.
- One storage story for quiz + avatars via one adapter (`put` / `delete` / `publicUrl`) and prefixes.
- Schema already URL-only (`QuestionAsset.url`, `User.image`, snapshot `imageUrl`) ? provider swap does not touch scoring or quiz hot path.

### Hard constraints (must not regress)

- Browser download of quiz images and avatars from RU **without VPN** = must-pass.
- URL-only in DB; freeze URL in quiz snapshot at start; resize/WebP **only at upload time**.
- Do not touch scoring / snapshot hot path / Neon direct-pg rules.
- IMAGE_GUESS UI stays full-frame `object-contain`; avatar circle stays `object-cover`.
- One adapter; one story (prefixes), not two zoos.
- Taste UI for upload controls = later Prompt T-Feature; this ADR only sets UI boundaries (file input + preview).

### Env names (no secrets in git)

```txt
STORAGE_PROVIDER=vercel-blob   # | yandex-s3 | local-public (dev only)

BLOB_READ_WRITE_TOKEN=         # Vercel Blob

# Origin Blob store ??? /media ? ??? trailing slash ? ??? Next rewrite
BLOB_PUBLIC_BASE_URL=          # https://<storeId>.public.blob.vercel-storage.com

S3_ENDPOINT=https://storage.yandexcloud.net
S3_REGION=ru-central1
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=

MEDIA_PUBLIC_BASE_URL=         # empty ? relative same-origin "/media"
```

### Key / URL prefixes

```txt
quiz/{id-or-slug}-{uuid}.webp
avatars/{userId}-{uuid}.webp
```

Public paths (preferred): `/media/quiz/...`, `/media/avatars/...`.  
Legacy seed paths remain valid: `/quiz-images/...`.

`QuestionAsset.storageKey` = object key; `QuestionAsset.url` / `User.image` = public path or URL frozen for clients.

### Security

- Quiz upload: `requireAdmin()`. Avatar upload: `requireUser()` (own user only).
- MIME allowlist: jpeg/png/webp. **No SVG**. Max input ~2 MB. Server **sharp** ? WebP.
- Rate limit later. Best-effort delete of previous object on replace/clear.

### Implementation order

1. ~~This ADR (+ demote old R2-preferred wording)~~ ? **done** July 23.
2. ~~Storage adapter + `/media` rewrite + sharp helpers~~ ? **done** (vercel-blob / local-public).
3. ~~Admin quiz file upload~~ ? **done** (URL advanced).
4. ~~Avatar Phase B~~ ? **done** local + **prod upload verified** July 23.
5. ~~RU smoke without VPN on prod~~ ? **done** July 23 evening (avatar, `/media`, admin IMAGE_GUESS, seed, quiz).
6. Taste UI for upload controls (Prompt T-Feature) ? later.

**Ops note (Next 16.2):** Server Action body limit ? `experimental.serverActions.bodySizeLimit` (e.g. `3mb`). Top-level `serverActions` is unrecognized in this release.

**Ops note (Vercel + sharp + Blob, July 23):** On Vercel, sharp often returns a `Buffer` backed by `SharedArrayBuffer`. `@vercel/blob` `put` ? fetch/undici rejects that body (`SharedArrayBuffer is not allowed`). Local Windows may work ? do not trust local-only upload smoke. **Correct fix:** copy into owned memory at the storage boundary (`Buffer.alloc` / fresh `ArrayBuffer` + `Blob` before `put`); also `serverExternalPackages: ['sharp', '@vercel/blob']`. Dual copy (after sharp + before put) is belt-and-suspenders; adapter-only copy would suffice later. Not a provider swap; not R2.

### Anti-patterns

- Choosing R2 because older DECISIONS said ?preferred?.
- Storing `*.r2.dev` / CF-only URLs as primary public URLs for RU audience.
- Processing images inside `startQuizAction`.
- Writing runtime uploads into `public/` on Vercel.
- Bytes in Postgres.
- Separate unrelated storage stacks for quiz vs avatars.
- Passing sharp `Buffer` straight into `put()`/`fetch` without an owned copy on Vercel.

Supersedes older ?Cloudflare R2 preferred? language in Question Media, Public Deploy, Avatar Storage, and Product Expansion notes.

## Avatar Storage And Upload (professional plan)

**Context:** GameMind already stores **URL only** in `User.image` (Auth.js-compatible). Interim UX lets the user paste an HTTPS/site-path URL. That shipped learning JWT/`unstable_update`. Phase B = file upload on the **same RU-first storage story** as quiz images (see **Media Storage And Upload (RU-first)**).

### Target product behavior (Phase B)

1. User picks a local file (`input type="file"`, accept jpeg/png/webp).
2. Server Action validates: `requireUser()`, MIME, max bytes (~2 MB), reject SVG/`image/svg+xml`.
3. Server **sharp**: center **cover** crop to square (e.g. 256 or 512 px) ? WebP.
4. `storage.put` under `avatars/{userId}-{uuid}.webp` ? public URL `/media/avatars/...` (preferred same-origin).
5. Write URL into `User.image` via existing `updateImage` (direct `pg`).
6. `unstable_update` + `router.refresh()` ? already wired.
7. Best-effort `storage.delete` of previous object on replace/clear (orphan cleanup later OK).

### Why not (updated)

| Option | Verdict for GameMind |
|--------|----------------------|
| `public/avatars/` in git / writable disk | Bad on Vercel (ephemeral FS); pollutes git |
| Postgres bytea | Rejected (same as quiz images) |
| **Vercel Blob + `/media`** | **Primary** ? ops on Vercel; delivery class matches proven same-origin |
| Yandex Object Storage | **Fallback** if Blob/rewrite fails RU smoke |
| Cloudflare R2 | **Demoted** ? CF Dashboard + CF public CDN risk for RU audience |

### Shared storage story with quiz images

- One provider via `STORAGE_PROVIDER`; prefixes: `avatars/...`, `quiz/...`.
- One module e.g. `src/lib/storage/` (`put` / `delete` / `publicUrl`) ? **not** `r2.ts` as the only path.
- Do **not** process images inside quiz `startQuizAction`.

### Implementation order (Phase B)

1. ADR RU-first (this file) + adapter + `/media` rewrite.
2. `sharp` helper `cropAvatarToWebp(buffer) ? Buffer`.
3. `uploadAvatarAction` ? validate ? sharp ? put ? `updateImage` ? JWT.
4. UI: file input primary; URL field advanced/optional.
5. Clear: DB NULL + best-effort delete + JWT clear.
6. RU smoke without VPN; then Taste UI if needed.

### Explicitly out of Phase B (Phase C)

- Interactive crop editor (zoom/pan) ? nice-to-have after baseline upload works.
- OAuth profile pictures sync ? later with OAuth.
- Multiple avatar sizes / srcset ? only if measured need.

### Anti-patterns

- Trusting client-only resize without server sharp.
- Storing raw multi-megabyte originals without resize.
- Writing avatars only to `public/` for production.
- Nesting `withDatabaseRetry` around direct `pg` avatar writes.
- Using `object-contain` in the circular avatar UI.
- Defaulting to R2 because older docs said ?preferred?.

### When to start Phase B

- After interim avatar on prod (**done** July 18) and after storage adapter exists.
- Prefer: adapter ? admin quiz upload **or** avatar upload (either order); smoke RU delivery before calling Phase B ?done?.

Tracking: `ROADMAP.md` ?11.4 / Immediate Next; `PROJECT_CONTEXT.md` Epic 4 Phase B; this ADR.

---

## Post-Launch UX Slice (continued)

### Admin user management

**Decision:** Add `/:locale/admin/users` with list, role change, delete, and soft-disable (`User.isActive`).

**Status (July 18, 2026 late evening):** **on prod** ? migration applied earlier; app code redeployed; user confirmed working on `www.game-mind.ru`. Hub at `/:locale/admin`; actions in `features/admin/actions/users.ts`.

**Guards:** `requireAdmin()`; cannot delete/disable/demote self; cannot remove last remaining ADMIN; never return `passwordHash`; inactive users fail `authorize` with generic invalid credentials.

**Ops notes:** admin list/users on unpooled direct `pg`; Server Action POSTs must pass through `proxy.ts` when `next-action` / `Next-Action` is present; Client Components import actions from `'use server'` files, not a bare re-export barrel.

**Why:** Live prod needs abuse/support tools; Prisma Studio is not a product admin UX.

**Anti-patterns:** Client-sent `role` on register; listing `passwordHash`; hard-delete as the only moderation tool; nested `withDatabaseRetry` around direct `pg`.

### Extra product decisions (same horizon)

- Prefer redeploying **one epic at a time** to production (Epic 2+3 shipped together July 16 because friends were not active yet).
- Primary public URL: `https://www.game-mind.ru` (`AUTH_URL` must match).
- Rate limiting auth endpoints ? next security pass after password change ships.
- Mixed-difficulty quiz mode ? after weighted scoring (done); when product wants it.

## Content Scale Pipeline (August 3, 2026)

**Decision:** grow the question bank via **structured bilingual draft JSON** → validate → import as `publicationStatus = DRAFT` → existing admin review / publish quality gate. Do **not** use giant edits to `scripts/seed-questions.cjs` as the primary content channel. Do **not** auto-publish on import.

**Contract v1:** `docs/CONTENT_PIPELINE.md` + `content/drafts/schema/draft-questions.v1.schema.json`. Samples: `content/drafts/examples/sample-text-v1.json`. TEXT for the JSON contract; IMAGE_GUESS uses sibling batch (`QUIZ_IMAGES.md` §5). Exactly 4 options; RU+EN required; `draftKey` optional for humans/idempotency (TEXT) / stable Question id (IMAGE_GUESS batch).

**Why:** admin form does not scale to hundreds; seed is bootstrap/demo; draft/review/publish + `getQuestionPublishQualityIssues` already exist — reuse them. Same JSON shape later becomes the AI/API emit target (Phase 5 leftover).

**Do not:** write `PUBLISHED` on import; skip quality gate; bloat seed; change quiz hot path / scoring / snapshot; start taxonomy for content scale.

**Status (Aug 4 late night):** TEXT steps **1–6 done** — AI emits same `version: 1` JSON; batches in `content/drafts/batches/`; import DRAFT-only; publish via admin on local + **prod**. Prod ops lesson: never confuse local/prod Neon hosts; after quiz schema deploys run prod `migrate deploy` (Aug 4: missing `AchievementOutbox` broke result until catch-up). See `CONTENT_PIPELINE.md` §10. Neon/quiz hot-path canon must not be undone for content work.

**Status (Aug 12 night):** local/prod TEXT+IMAGE banks aligned after C1–C3 local catch-up and deleting local-only samples/mixed/early admin rows. Quiz pool TEXT **270** + IMAGE_GUESS **171** on both Neons. TEXT import is **not** idempotent (new UUIDs); do not re-import a published batch. Drift check: `content:smoke-text` / `content:smoke-image-guess` with `--target=prod`. Canon: `CONTENT_PIPELINE.md` §10 “Local vs prod drift”.

**IMAGE_GUESS sibling (Aug 6):** batch ×90 is **not** TEXT `draft-questions.v1` — separate manifest + `scripts/import-image-guess-batch.cjs` (seed-style Neon client). Still **DRAFT-only** on import + admin Publish. Canon: `docs/QUIZ_IMAGES.md` §5–§6; ADR below.

## IMAGE_GUESS Batch Import + Lightbox (August 6, 2026)

**Decision:** Grow visual questions via curated JSON batch + optimized `public/quiz-images/**` WebP + CLI import that mirrors **seed Neon hygiene**, not via bloating `seed-questions.cjs` and not via TEXT draft importer (which hardcodes `type: TEXT` and has no assets).

**Import contract:**
- Manifest: `content/drafts/batches/2026-08-05-image-guess-90.json` (`kind: IMAGE_GUESS_BATCH`).
- Script: `npm run content:import-image-guess` → `scripts/import-image-guess-batch.cjs`.
- Rows: `QuestionType = IMAGE_GUESS`, `publicationStatus = DRAFT`, `isActive = true`, bilingual options, `QuestionAsset` role `PROMPT` → `/quiz-images/{folder}/{stem}.webp`.
- Stable primary key = `draftKey` (upsert-friendly). Re-import updates content/asset; **does not** downgrade/upgrade `publicationStatus`.
- Targets: local `DATABASE_URL_UNPOOLED`; prod `--target=prod` + `PROD_DATABASE_URL_UNPOOLED` with host guards (`jolly-river` ≠ prod).

**Neon pattern (mandatory):** fresh Client per question body + separate Client for asset (like `update-quiz-image-assets.cjs`); `client.on('error')`; retry transient; sleep between items; clear stale idle backends periodically. **Avoid:** one long-lived connection for 90 questions; `query_timeout` that leaves zombie backends; auto-PUBLISH.

**Static files:** Vercel serves WebP from git. Importing DB rows without committing/deploying `public/quiz-images/**` → admin/quiz broken images (404). Lesson Aug 6: thumbs appeared only after WebP commit/deploy.

**Lightbox UX (presentation):**
- `QuestionImage`: enlarge on click; dismiss without Close button — click, any touch, Esc / Enter / Space / Backspace; ghost-tap guards.
- Scrim uses **neutral black** (`black/55` light, `black/80` dark). Never `bg-foreground/*` for overlay (in dark theme foreground is light → milky veil).
- Keep full-frame `object-contain`; no glow; Scoreboard Editorial calm.

**Do not:** auto-PUBLISH; change scoring/snapshot/Direct hot path; put image bytes in DB; use CDN hotlinks for MVP batch; invent a second design system for the overlay.

**How this affects growth:** TEXT pipeline + IMAGE_GUESS batch share the same product rule (import DRAFT → human Publish). Later Blob uploads stay compatible (`QuestionAsset.url` can be `/media/...` or `/quiz-images/...`).

**References:** `QUIZ_IMAGES.md`, `CONTENT_PIPELINE.md` (DRAFT rule), `DEPLOY.md`, `seed.cjs`, `update-quiz-image-assets.cjs`.

## API-Assisted Question Generation

Future idea: generate draft questions using external game data APIs.

Candidate APIs:

- IGDB: rich game database, more setup, Twitch developer account required.
- RAWG: easier to start, data quality and usage terms must be reviewed.

Recommended future pipeline:

1. Fetch raw game data from API.
2. Normalize game metadata.
3. Generate draft questions from deterministic templates.
4. Generate wrong answer options from similar entities.
5. Validate duplicates and data completeness.
6. Save generated questions as drafts.
7. Admin reviews and publishes.

Important decision: generated questions should not go directly into live quizzes.

## Automation vs Manual Creation

- Manual creation is better for MVP and learning the domain.
- API-assisted generation makes sense later when there is an admin review workflow.
- Fully automatic publishing is risky because data quality, ambiguity, licensing, and wrong distractors can damage quiz quality.
- A hybrid approach is likely best:
  - AI/API helps create drafts;
  - human/admin reviews;
  - only approved questions are published.

---

## Taste Skill Visual Identity (Scoreboard Editorial)

**Date:** 2026-07-21 (updated evening ? Wave A ?14 complete locally)

**Decision:** Product UI follows **Scoreboard Editorial** ? sharp, competitive-but-clean, editorial scoreboard / game-press feel. Foundation work is ROADMAP ?11.8. Canon lives in `docs/TASTE_SKILL.md` (?4 lock, ?6 audit, ?13 strategy, ?14 backlog). Project skill: `.cursor/skills/gamemind-taste-ui`.

**Status (2026-07-22):** Design lock **in code**. **Wave A + Wave B closed on prod** (smoke OK). Status = **`ongoing`**. New UI = Prompt T-Feature + ?7.

**Tooling:** Taste Skill (always for UI discipline); Google Stitch and Pencil.dev optional for comps/specs only. Cursor + this repo are the only production-code source. Never paste generated app code from external tools.

**Boundaries:** Presentation layer only. Visual PRs must not touch quiz snapshot, scoring, direct `pg` hot paths, Auth.js security, Prisma schema, or domain types. IMAGE_GUESS full-frame must not regress. All user-visible strings stay in i18n dictionaries. Code comments in Russian (project preference).

**Process:** One UI backlog task (?14 / Wave B item) per chat; commit the code for that task before starting the next task in a new chat (Prompt T-Task).

**Why:** MVP works functionally but lacks a locked brand; without a canon, screens drift (quiz tokens vs home/auth `neutral-*`). A single direction + incremental tasks protect learning workflow and business logic.

**Anti-patterns:** Second parallel theme system; glass/orbs/purple SaaS gradients; changing submit rules or one-question flow ?for prettier UI? without an explicit product decision; mixing Taste UI commits with Neon/SQL or ?11.7 repo splits.

---

## Admin List Neon Hang Mitigation (July 24, 2026)

**Date:** 2026-07-24

**Decision:** Keep `findAllForAdmin` on a **deliberately constrained** direct-`pg` path until a safer full-featured query is proven in `next dev` (Windows) + Neon. Do not ?simplify back? to Prisma nested `findMany`, translation JOINs, or shared Pool without re-measuring the hang class.

**Context:** Full admin question list hung or returned `loadFailed` (~24?36s) while filtered URLs and the same SQL outside Next were fine. Later, filter ? Reset reproduced the hang via TLS teardown / empty-WHERE / Pool slot bugs. Quiz snapshot/scoring stayed healthy and must stay untouched.

**Chosen shape:**

1. **Simple SQL** ? no `QuestionTranslation` JOIN in the list SELECT; no `client.query(sql, params)` / `ANY($1)` on this path; enum/q filters inlined via allowlist/escape.
2. **Filtered / narrow WHERE** ? user filters use one SELECT (healthy).
3. **Unfiltered / no difficulty (July 26; see Aug 4 pagination update below)** ? historically: do **not** rely on unbounded `WHERE true` or `UNION ALL` (both hung ~24s when returning all rows). Prefer narrow difficulty SELECTs for full-bank dumps. **Paginated admin list (Aug 4)** uses `COUNT` + `LIMIT/OFFSET` instead — do not revive unbounded or 3× over-fetch-by-page.
4. **Serialized fresh Client** via `withAdminListPgClient` ? `withDirectPgClient` (unpooled) with wall-clock timeout + socket destroy; **+300ms settle** before releasing the queue.
5. **Hard navigation** for admin list filters / Reset / hub?questions link / **pagination** (Aug 4).
6. **Thumbs** ? separate connect (page IMAGE_GUESS ids or 60s in-memory PROMPT map); never a second query on the same client after the list SELECT.
7. **Dev keep-warm** ? `instrumentation.ts` + optional hub ping (`warmAdminListConnection`) to soften Neon sleep (not a cure for hang class).

**Explicit tradeoffs:** legacy `Question.text` on the list; `optionsCount = 0` for now; hard reloads; paginated list pays 2× connect+settle unless cache hit. Follow-ups: optional `createdAt` index if bank ≫1k; `ROADMAP` / PROJECT_CONTEXT playbooks.

**Why:** Measured failures were Next+Windows+Neon connection/protocol issues, not row count. A constrained path restores admin usability without risking the quiz hot path.

**Risks / do not:**

- Reintroduce JOIN / prepared params / same-client multi-query ?to restore locale/counts? without smoke: full ? filter ? full Reset.
- Shared `Pool` + `Promise.race` that rejects without destroying/releasing the client.
- Soft RSC on this path without proving no teardown wedge.
- Awaiting `client.end()` on the response path (~19s class).
- Mixing this work with Taste UI or ?11.7 refactors in one change set.
- Reintroduce full-table / `UNION ALL` unfiltered list without re-measuring.

**How to verify:** `GET /api/dev/admin-questions-smoke` (± difficulty) and browser filter ↔ Reset; paginated list (any `?page=`) should be seconds not ~24s/~40s. Outside Next: `node scripts/smoke-admin-list.cjs`. After many timeouts: restart `npm run dev`.

### Update — Admin list pagination (August 4, 2026)

**Status:** **Done + user-verified** (page 1→4).

**Decision:** Paginate `/admin/questions` with URL `?page=` (1-based) and fixed `ADMIN_QUESTION_LIST_PAGE_SIZE = 25`. `findAllForAdmin` returns `{ rows, totalCount, page, pageSize }`.

**Read shape (replaces unbounded / 3× over-fetch list):**

1. `COUNT(*)` (optional filters in WHERE) — one queued connect.
2. `SELECT … ORDER BY createdAt DESC LIMIT 25 OFFSET …` — second queued connect.
3. Thumbs: PROMPT urls for IMAGE_GUESS ids **on the current page only** (`ANY($1::text[])` on a fresh client); merge into 60s in-memory map.

**Why change from 3× difficulty over-fetch:** page≥3 fetched `LIMIT page*25` × three difficulties → multi-TLS + large text payload → `DirectPgTimeout` 18s / `loadFailed`. Historical ~24s hang was **unbounded** full-list transfer; `LIMIT 25` is a different class and is the pagination path.

**UI / nav:** `AdminQuestionsPagination` — hard `location.assign` (same Neon contract as filters; no soft `<Link>` RSC); `PendingSpinner` + loading copy while navigating. Filters/search reset `page → 1`.

**Do not:** unbounded list SELECT; soft page navigation; revive 3× over-fetch-by-page; put list work on quiz Direct queue; await `client.end()` on response path.

---

## Daily Challenge MVP (July 29?30, 2026)

**Date:** 2026-07-29 (kickoff) ? **2026-07-30 shipped on prod** (migration + UI smoke OK).

**Status:** **Done (MVP).** Do not reopen unless bugfix. Follow-ups (streaks, admin-picked sets, timed daily) are later product work.

**Decision:** Player-facing growth epic after leaderboard difficulty + period filters is **Daily Challenge MVP** ? one shared quiz set per calendar day, one attempt per user, reuse existing session snapshot + server scoring.

**Product why (public beta):** friends need a reason to open the app again tomorrow. Profile stats and period boards reward past play; daily challenge creates a return loop without requiring Category taxonomy or a full achievements system.

**MVP contract (shipped):**

| Rule | Choice |
|------|--------|
| Day boundary | `Europe/Moscow` calendar date as `YYYY-MM-DD` |
| Question set | Same `questionIds` for everyone that day; freeze on first create (lazy `ensureDailyChallenge`) |
| Difficulty / count | Fixed: `MEDIUM` ? 10 (`DAILY_CHALLENGE_MVP_RULES`) |
| Attempts | **One** session per user per day ? `UNIQUE (userId, dailyChallengeId)`; resume / result redirect |
| Scoring | Unchanged weighted scoring from frozen snapshot |
| Pool | Only `isActive` + `PUBLISHED` at freeze time; snapshot load by frozen ids (no mid-day pool filter) |
| Entry | CTA on home + `/quiz` (Scoreboard Editorial); guest ? login |
| Leaderboard | Compact **today?s board** under CTA (`findScoresByChallengeId`) ? not a rewrite of global `/leaderboard` |

**Schema (migration `20260729234500_daily_challenge`, local + prod):**

- `DailyChallenge`: unique `challengeDate` DATE, difficulty, questionCount, frozen `questionIds` JSONB
- `QuizSession.dailyChallengeId` nullable FK `ON DELETE RESTRICT`
- Deterministic pick: sort candidates + mulberry32 seed from date key

**Key code:**

- Types: `src/features/daily-challenge/types.ts`
- Ensure/pick/date: `src/features/daily-challenge/lib/*`
- Repo: `src/entities/daily-challenge/daily-challenge.repository.ts`
- Start: `src/features/daily-challenge/actions/start-daily-challenge.ts`
- UI: `DailyChallengeCta` + panel + board

**Explicitly NOT in MVP (still true):** timed mode, streak system, achievements unlock hooks, category filters, admin hand-picked daily sets, changing `submitQuizAction` math.

**Why not achievements / category boards as the epic we picked then:** daily gives return loop first. **Achievements MVP shipped after daily; catalog v2 July 31.** Next mode candidate: timed (see Achievements ADR + ROADMAP Immediate Next).

**Risks / do not:**

- Client-submitted score or live pool scoring.
- Regenerating the day's `questionIds` after anyone has started.
- Nesting `withDatabaseRetry` around direct `pg` snapshot writes.
- Treating node-pg DATE as UTC-only without `toDateKey` local-midnight handling (Windows).

## Achievements MVP (July 30, 2026) + catalog v2 + criteria progress (July 31, 2026)

**Date:** 2026-07-30 (MVP kickoff ? shipped on prod). **Catalog v2:** 2026-07-31 (`06aeae2`). **Criteria progress UI:** 2026-07-31 (`8f600fb`).

**Status:** **Done (MVP + v2 + progress).** Aug 4 night: delivery via **AchievementOutbox** (same write hop as complete) + result Suspense/profile processor — do not put sync award TLS before result read again. Further badges = additive catalog codes only.

**Decision:** Player-facing growth after Daily Challenge is **Achievements** ? a small server-awarded badge catalog on profile, unlocked from already-stored quiz/daily facts. No client-claimed unlocks. No change to weighted scoring or snapshot hot path.

**Product why (public beta):** daily brings players back; profile stats summarize past play; achievements turn milestones into visible progress. Friends see something collectible without Category taxonomy or timed mode first. After catalog ladder v2, locked tiles need **how close** (`7 / 10`) or the ladder does not motivate.

**MVP contract (still true):**

| Rule | Choice |
|------|--------|
| Catalog source | Code-defined catalog (`ACHIEVEMENT_CATALOG` + codes) ? titles/descriptions via i18n, not admin CRUD |
| Persistence | `UserAchievement` only: `(userId, code)` unique + `unlockedAt`. No `Achievement` table |
| Who awards | Server only ? after quiz complete (+ optional profile catch-up) |
| Criteria inputs | `QuizResult` + `QuizSession` (difficulty, `dailyChallengeId`) ? never trust client |
| Failure mode | Unlock soft-fail ? must not break submit/result UX |
| UI surface | Profile + unlock toast (`?unlocked=`); Scoreboard Editorial; no new nav item |
| Backfill | Idempotent evaluate on profile load |
| Progress display | Server `criteriaCurrent` / `criteriaTarget` on progress DTO; locked tiles show i18n `criteriaProgress`; unlocked keep date. Not client-computed. |

**Catalog codes (current ? 7):**

| Code | Criteria | Notes |
|------|----------|--------|
| `FIRST_QUIZ` | `quizzes_completed_at_least` ? 1 | MVP |
| `QUIZZES_5` | ? 5 | MVP |
| `QUIZZES_10` | ? 10 | **v2** mid-ladder |
| `PERFECT_QUIZ` | `correctCount === totalQuestions` (> 0) | MVP |
| `DAILY_COMPLETE` | any session with `dailyChallengeId` | MVP |
| `MEDIUM_QUIZ` | session `difficulty = MEDIUM` | **v2** step before HARD |
| `HARD_QUIZ` | session `difficulty = HARD` | MVP |

**Catalog v2 decision (July 31):** extend retention with two codes after Toast closed ? **not** a new mode. Chosen over timed (anti-cheat/UX surface) and taxonomy (no filter demand). Implementation order that worked: `types` ? `evaluate` + Vitest ? SQL facts (`has_medium`) ? i18n ? illustrations. **No Prisma migration** for new codes (string `code` column already).

**Criteria progress decision (July 31, `8f600fb`):** presentation-only follow-up after v2. Pure `getAchievementCriteriaProgress` + `findProgressContextByUserId` (one client) + profile list. Does **not** change unlock rules. Separate i18n key `criteriaProgress` from section `progressCount`.

**How to add another badge later:**

1. Add `AchievementCode` + catalog row (+ new `AchievementCriteriaKind` / `AchievementEvalFacts` field only if needed).
2. Evaluate switch + unit tests (thresholds / flags).
3. Extend `EVAL_FACTS_SQL` + mapper if new fact.
4. Extend `getAchievementCriteriaProgress` if new criteria kind.
5. `dictionary` + `ru` / `en` `items[CODE]`.
6. Illustration + `ACHIEVEMENT_ILLUSTRATIONS` map.
7. Do **not** change award hook / scoring / snapshot unless criteria need new data sources.

**Explicitly NOT (still):** rarity/points economy, public LB showcase, admin CRUD, streak achievements, category unlocks, notification inbox, scoring math changes, unlock SQL inside Neon snapshot write path. Do not rename shipped codes without data migration.

**Why not taxonomy still:** no product pressure. **Timed mode:** preferred next *mode* epic after achievements progress; higher cost than another badge.

**Risks / do not:**

- Award from client-submitted score or unsigned ?claim? action.
- Put unlock logic inside scoring calculation (post-result side effect only).
- Block result redirect on fragile Neon unlock paths.
- Invent a second visual language (extend Scoreboard Editorial + existing plaque SVGs).
- `Promise.all` of two `withDirectPgClient` for award/progress context on Windows/`next dev`.
- Trust client-sent `criteriaCurrent` / `criteriaTarget`.

**Schema (migration `20260730120000_user_achievement` ? unchanged by v2 / progress UI):**

- `UserAchievement`: `userId`, `code`, `unlockedAt`; `UNIQUE (userId, code)`; FK cascade on User
- No `Achievement` catalog table (variant A)

**Multi-domain future (movies / football / music):**

- Codes stay domain-agnostic (`FIRST_QUIZ`, not video-game-specific names)
- Criteria read QuizResult/QuizSession facts that outlive content taxonomy
- Category-scoped badges later = new codes and/or optional `scope` when taxonomy exists ? do not invent taxonomy for achievements alone

**Key code:**

- Types / catalog: `src/features/achievements/types.ts`
- Migration: `prisma/migrations/20260730120000_user_achievement`
- Smoke: `scripts/smoke-user-achievement-schema.cjs`
- Evaluate + tests: `src/features/achievements/lib/evaluate-achievements.ts`
- Criteria progress metrics: `src/features/achievements/lib/achievement-progress-metrics.ts`
- Progress loader: `src/features/achievements/lib/get-achievement-progress.ts`
- Award: `src/features/achievements/lib/award-achievements-for-user.ts`
- Repo (facts SQL + `findProgressContextByUserId`): `src/entities/user-achievement/user-achievement.repository.ts`
- Profile list: `src/features/achievements/components/ProfileAchievementsList.tsx`
- Illustrations: `src/features/achievements/illustrations/index.tsx`
- Hook: soft-fail in `submitQuizAction` after `completeWithResult`
- Unlock flash: `?unlocked=` + `AchievementUnlockFlash` (Toast ADR)

## Toast Notifications MVP (July 30, 2026 ? shipped)

**Date:** 2026-07-30 (decision) ? **shipped same day** (unlock flash + theme/i18n polish).
**Status:** **Done (MVP).** Extend with `toastSuccess` / `toastError` / `toastInfo` or feature `toast.custom` cards; do not invent a second toast library or inbox.

**Decision:** Shared ephemeral toast bus via **Sonner**, Scoreboard Editorial tokens. Achievement unlock after quiz uses flash query `?unlocked=` (display-only). Not react-hot-toast. Not a persistent notification inbox.

**Product why:** Achievements without feedback after quiz feel invisible; profile list alone is discovery, not celebration. Same primitive later covers profile save, admin actions, rate-limit hints ? one UX language.

### Shipped architecture

| Piece | Path / rule |
|-------|-------------|
| Provider | `AppToaster` in `src/app/[locale]/layout.tsx` (one place) |
| Generic helpers | `toastSuccess` / `toastError` / `toastInfo` in `src/shared/ui/toast.ts` |
| Achievement unlock UI | `toast.custom` cards in `src/features/achievements/components/AchievementUnlockToast.tsx` (own flex layout ? **do not** stuff large marks into Sonner `[data-icon]` slot) |
| Flash delivery | `submitQuizAction` ? `?unlocked=CODE,?` ? `AchievementUnlockFlash` ? `router.replace` strip |
| Theme live sync | Sonner `--normal-bg` etc. remapped to `var(--surface)`; `THEME_CHANGE_EVENT` + `data-theme` MutationObserver (`theme-client.ts`) |
| i18n live sync | Achievement card reads `getDictionary` from **pathname locale** (RU?EN updates open toast) |
| Award DB | `findAwardContextByUserId` ? **one** unpooled client, sequential SELECTs (never `Promise.all` of two `withDirectPgClient` on Windows/`next dev`) |

### How to add a new toast (keep the style)

1. **Prefer helpers** for simple copy: `toastSuccess(dictionary.notifications.successSaved)` ? pass already-localized strings; never hardcode RU/EN in call sites.
2. **Rich / branded cards** (icons, marks, multi-line Scoreboard chrome): `toast.custom` + `unstyled: true` + own Tailwind (`bg-surface`, `border-border`, `border-l-4 border-l-primary|success|danger|info`, `font-display` title, `text-muted` description, close control with `notifications.closeToast`).
3. **Theme:** rely on CSS variables on `<html data-theme>` ? do not bake `#fff`/`#000`; do not invent a second palette.
4. **Locale:** if the toast may stay open across language switch, render copy inside a Client Component that reads locale from `usePathname()` + `getDictionary` (like achievement cards). Static strings freeze at show-time.
5. **Placement:** desktop (`lg+`, ?1024px) `top-right` under sticky header; **below `lg` `bottom-center`** (tablet/phone ? sticky header / filters must not cover toast). Toaster portals to `document.body` with `z-index: 200` (above header/menu `z-50`).
6. **When NOT to toast:** form field validation (use `InlineAlert` next to the field); profile catch-up / silent backfill; every keystroke; anything that must persist (inbox later).
7. **Security:** never treat toast/query params as authority to write unlocks or scores ? server/DB only.
8. **Flash strip:** after `?unlocked=` / `?notice=` toast, delay `router.replace(..., { scroll: false })` (~100?120ms) so the first paint is not lost on soft navigation.
9. **Scroll-preserving mutations:** list/profile mid-page actions must **not** `redirect` on success when the user stays on the same URL. Prefer `revalidatePath` + return (or client toast + `refreshPreservingScroll`). Profile settings `<details>` must live in a Client island so soft refresh does not collapse it.

### Explicitly NOT in MVP (still true)

- Persistent notification center / bell icon / unread counts
- Email/push
- Toasting every form keystroke
- Blocking submit on toast failure
- Changing award criteria or scoring

### Follow-ups (optional, not blockers)

- Profile settings success (username / password / avatar) ? **done**: `toastSuccess`; success InlineAlert removed (errors stay InlineAlert, including RATE_LIMITED)
- Admin create/edit success ? **done**: `?notice=` allowlist + `AdminNoticeFlash`
- Admin bulk success ? **done**: return result + client toast + `refreshPreservingScroll` (no success redirect)
- Admin/list single-row + users success ? **done**: `revalidatePath` only (no success redirect; scroll stays)
- Soft `RATE_LIMITED` toast ? **skipped on purpose**: forms already show InlineAlert; do not double-notify

### Risks / do not

- Trust `unlocked` query as authority to **write** unlocks ? query is display-only; DB remains source of truth
- Put Toaster only on one page (miss result / other routes)
- Parallel `withDirectPgClient` via `Promise.all` around award/submit on Windows next dev
- Spam 5 stacked achievement toasts without stagger / summary (`MAX_INDIVIDUAL_ACHIEVEMENT_TOASTS = 3`)

### How this affects growth

Same toast bus serves future movies/football modes and admin feedback without new infrastructure. Inbox can come later without throwing Sonner away (toasts stay ephemeral; inbox = separate store).

---

## Timed Mode MVP (July 31, 2026 - kickoff)

**Date:** 2026-07-31 (contract kickoff). **Status:** MVP on origin + Aug 2 polish (abandon, rematch, review Neon harden, RU labels). **Prod schema** `timedEndsAt` applied. Redeploy polish pending.

**Decision:** Next player-facing Phase 5 play-mode epic after Achievements criteria progress is **Timed mode MVP** - a classic-shaped quiz (fixed question count, frozen JSON snapshot, weighted server scoring) with a **server-authoritative deadline**. Client countdown is UX only.

**Product why (public beta):** Classic + Daily cover "pick a quiz" and "come back tomorrow". Friends still lack a pressure loop ("can I finish before the clock?"). Timed is a new play loop without taxonomy and without inventing more badges. Higher cost than another achievement code - justified because retention now needs variety of *play*, not only collectibles.

**MVP model (locked):**

| Rule | Choice |
|------|--------|
| Shape | Fixed `N` questions (not endless "answer as many as you can") |
| Snapshot | Same `createWithJsonSnapshot` path as classic; pool `isActive` + `PUBLISHED` |
| Scoring | Unchanged weighted EASY=1 / MEDIUM=2 / HARD=3 from frozen snapshot |
| Clock authority | Server `timedEndsAt` at start; client timer display-only |
| Duration | `TIMED_MODE_MVP_RULES.durationSeconds` = 60 for whole session |
| Question count | Fixed 10 (`TIMED_MODE_MVP_RULES.questionCount`) |
| Difficulty | Player choice EASY\|MEDIUM\|HARD (like classic setup) |
| Grace | `graceSeconds` = 3 on submit (RTT / clock skew) |
| Late submit | After `timedEndsAt + grace` ? `TIMED_OUT` (no score). At/near 00:00 client **auto-submits** within grace (Kahoot/LMS pattern) |
| Answers | Classic/daily: all required. Timed: **partial OK** ? unanswered = 0 in weighted scoring; auto-submit on expire |
| Daily interaction | Timed sessions keep `dailyChallengeId` NULL; do not mix modes |
| Attempts | Unlimited (not once-per-day) |
| Stuck session | On new Timed start: mark user's other timed `IN_PROGRESS` (`timedEndsAt IS NOT NULL`) as `ABANDONED` — no result, no resume |
| Entry | CTA on home and `/quiz` - Scoreboard Editorial; guest -> login |

**Why fixed-N + deadline (not endless stream):**

- Reuses stable Neon snapshot + `ANSWER_ALL` + result review + achievements award hook.
- Endless mode needs dynamic pick mid-session or a huge pre-freeze pool and different scoring UX - deferred.
- Anti-cheat stays simple: one timestamp check on submit.

**Schema (migration `20260731140000_quiz_session_timed_ends_at`, local; prod later with start path):**

- Nullable `QuizSession.timedEndsAt DateTime?` (NULL = classic/daily).
- Discriminator: `timedEndsAt IS NOT NULL` => TIMED; `dailyChallengeId IS NOT NULL` => DAILY; else CLASSIC.
- Do **not** put the deadline only in client state or only inside JSON without a queryable column (submit must filter cheaply).
- Snapshot JSON shape stays the question freeze; deadline is session metadata, not per-question content.
- Classic/daily raw `INSERT` paths omit the column ? remain NULL (safe additive change).

**Key code (planned order):**

1. Types: `src/features/timed-mode/types.ts` <- **this kickoff**
2. ADR (this section) + continuity docs
3. Prisma migration `timedEndsAt`
4. `startTimedQuizAction` (or flag on start) -> set `timedEndsAt = now + duration`
5. Quiz page: pass `timedEndsAt` -> client countdown island
6. `submitQuizAction` gate: if timed and now > endsAt+grace -> `TIMED_OUT`; timed allows partial answers
7. Quiz UI: auto-submit on 00:00; lock answers; TIMED_OUT recovery CTAs (try again / home)
8. i18n + CTA UI (Taste: presentation only)

**Stuck timed abandon (July 31 follow-up):**

**Problem:** Timed allows unlimited starts. If the player leaves mid-quiz and starts again, the old row stays `IN_PROGRESS` forever (orphan). Opening the old URL after deadline still hits `TIMED_OUT` / empty UI; profile history ignores incomplete — but the row is noise and blocks a clean "one live timed attempt" mental model.

**Decision:** when creating a Timed session (`timedEndsAt` set), abandon that user's other timed `IN_PROGRESS` rows (`status = ABANDONED` where `timedEndsAt IS NOT NULL`) **on the same pooled quiz-start client** as the snapshot INSERT (`createJsonSnapshotSession`). No `QuizResult`. Do not resume timed. Do not touch classic (`timedEndsAt` NULL) or daily.

**Neon note:** do **not** open a separate `withDirectPgWriteClient` round-trip before start — extra unpooled TLS is a known Windows+Neon hang class. Abandon shares the existing `withPooledPgQuizStartClient` connection (timeout + retry already applied to quiz start).

**Why not resume:** deadline is the product; resuming hours later is a different mode. Daily already resumes because of one-attempt-per-day UNIQUE — different rule.

**Do not:** DELETE orphan rows (lose audit trail); abandon classic/daily; write `COMPLETED` without scoring; put abandon only in the client; add a second DirectPg write hop solely for abandon.

**Explicitly NOT in MVP:**

- Per-question timers / survival / streak mode
- Endless "as many as possible in T seconds"
- Client-trusted remaining time or client-submitted score
- Separate timed leaderboard (can come later as filter/mode)
- Changing weighted scoring math or snapshot question freeze rules
- Nesting `withDatabaseRetry` around direct `pg`; awaiting `client.end()` on response path
- Mixing Timed deadline into Daily Challenge sessions
- Achievement codes that require timed wins (additive later if product wants)
- Reopening Toast / achievements award core / Daily core without a bug
- Resume of timed sessions (abandon-on-new-start only)

**Compared and deferred:**

| Option | Why not now |
|--------|-------------|
| More achievement badges | Ladder + criteria progress just shipped (`8f600fb`); low pressure |
| Taxonomy filters | No real "only FPS" demand; bank still small |
| Endless timed | Higher anti-cheat + UX cost; breaks ANSWER_ALL / review assumptions |

**Risks / do not:**

- Trust browser `Date.now()` or a hidden form field for remaining time.
- Auto-award full score after timeout without answering.
- Change classic/daily start/submit behavior for non-timed sessions.
- Write relational `QuizSessionQuestion` rows on hot path again (keep JSONB snapshot).
- Skip grace and punish honest mobile latency.
- Ship UI countdown before server `timedEndsAt` exists (fake urgency = cheat magnet).

**How this affects growth:** Timed proves a second *mode* on the same session/result pipeline. Survival and mixed modes can follow the same pattern (extra columns + submit gates) without a second quiz engine.

**References:** `Neon Write Path For Quiz Snapshot`; Daily Challenge MVP (reuse start/snapshot lessons, different product rules); Achievements MVP (award stays post-submit side effect).
