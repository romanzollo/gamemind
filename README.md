# GameMind

Bilingual (`ru` / `en`) video-game quiz: Classic, Blitz, and Daily Challenge, with image-guess questions, a leaderboard, achievements, and an admin content pipeline.

**Status:** public beta — live portfolio product, not a private prototype.

**Live:** [https://www.game-mind.ru](https://www.game-mind.ru)

## Features

- **Auth** — register / login / logout; roles `USER` | `ADMIN`; JWT session is identity only, current `role` / `isActive` come from the database
- **Classic** — player picks difficulty and 1–10 questions; frozen session snapshot; rematch; per-user anti-repeat cycle
- **Blitz** (timed) — 10 questions, 60s **server** deadline; client timer is display-only; unanswered count as 0
- **Daily Challenge** — one shared `MEDIUM` × 10 set per Moscow calendar day; one attempt per user
- **Question types** — `TEXT` and `IMAGE_GUESS` (WebP; seed files in `public/quiz-images/`, uploads via object storage)
- **Scoring** — server-only from the session snapshot (`optionId`); weights EASY=1 / MEDIUM=2 / HARD=3; client never sends a score
- **Result** — score paints first; answer review loads separately (must not block submit)
- **Leaderboard** — best `QuizResult.score` per user; optional difficulty and rolling 7/30-day filters
- **Profile** — history, stats, username / password / avatar, achievement progress
- **Admin** — question CRUD, draft → review → publish, quality gate, bulk actions, users hub
- **i18n** — locale routes `/ru/...` and `/en/...` for UI **and** question/option text
- **Content bank** — bootstrap seed (~60 bilingual questions); production pool is hundreds of published TEXT + IMAGE_GUESS rows via a draft JSON pipeline

## Stack

| Layer | Choice |
|-------|--------|
| App | [Next.js](https://nextjs.org/) 16 (App Router) · React 19 · TypeScript |
| Database | PostgreSQL on [Neon](https://neon.tech) — separate local and production projects |
| Access | [Prisma](https://www.prisma.io/) ORM + raw [`pg`](https://node-postgres.com/) on Neon-critical paths |
| Auth | [Auth.js](https://authjs.dev/) (next-auth v5) — credentials + JWT |
| Validation | [Zod](https://zod.dev/) on Server Actions |
| UI | Tailwind CSS v4 · light/dark via CSS variables · Scoreboard Editorial |
| Media | Vercel Blob + same-origin `/media` rewrite (local: `public/media/`) |
| Tests | [Vitest](https://vitest.dev/) unit tests · GitHub Actions on `master` |
| Deploy | Vercel Hobby · custom domain (REG.RU DNS) |

Architecture (layers, Neon queues, quiz invariants): **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)**.

## Repository layout

```txt
src/
  app/            # [locale] routes, layouts, Route Handlers
  proxy.ts        # Next.js 16 edge guard (locale + JWT UX only)
  features/       # auth, quiz, timed-mode, daily-challenge, leaderboard,
                  # profile, admin, achievements, content
  entities/       # data access (Prisma and/or parameterized pg)
  lib/            # prisma, auth guards, direct-pg, rate-limit, storage
  shared/         # UI, i18n dictionaries, utils
prisma/           # schema + migrations
scripts/          # seed, Windows migrate helpers, content CLI, smokes
content/drafts/   # bilingual draft JSON batches (import as DRAFT only)
docs/             # architecture, deploy, hot path, content, i18n
```

## Getting started

1. Copy env and fill **local** Neon credentials (see `.env.example`):

   ```bash
   cp .env.example .env
   ```

2. Install and generate the Prisma client:

   ```bash
   npm install
   npm run db:generate
   ```

3. Apply migrations. On Windows, `prisma migrate dev` may fail with `P1017` — prefer:

   ```bash
   node scripts/apply-named-migration.cjs <migration_folder_name>
   ```

4. Optional seed (bootstrap bank only — not the full production catalog):

   ```bash
   npm run db:seed
   npm run images:update-db
   ```

5. Dev server:

   ```bash
   npm run dev
   ```

Open [http://localhost:3000/ru](http://localhost:3000/ru).

Keep local and production Neon URLs **separate**. Do not comment out `DATABASE_*` lines in `.env` — some scripts regex-match commented values. Use distinct `PROD_*` names or a temporary swap with restore.

## Environment

Use **two different** Postgres URLs:

| Variable | Neon tab | Hostname |
|----------|----------|----------|
| `DATABASE_URL` | Pooled | contains `-pooler`; add `&pgbouncer=true` |
| `DATABASE_URL_UNPOOLED` | Direct | **without** `-pooler` |

Do not paste the same string into both. Production also needs `AUTH_SECRET`, `AUTH_URL`, and Blob vars (`BLOB_READ_WRITE_TOKEN`, `BLOB_PUBLIC_BASE_URL`). Full list: `.env.example` and [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Dev server (stops a leftover Next process first) |
| `npm run build` | `prisma generate` + production build |
| `npm run lint` | ESLint |
| `npm run test` | Vitest unit suite (no Neon) |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Prisma migrate dev |
| `npm run db:seed` | Seed bilingual bootstrap questions |
| `npm run db:studio` | Prisma Studio |
| `npm run content:validate-drafts` | Validate draft JSON without DB writes |
| `npm run content:import-drafts` | Import TEXT drafts as `DRAFT` |
| `npm run images:optimize` | Raw screenshots → WebP |
| `npm run images:update-db` | Point `QuestionAsset` URLs at WebP |

## Documentation

| Doc | What it is |
|-----|------------|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Layers, Neon access, quiz hot path, auth, media |
| [`docs/QUIZ_NEON_HOT_PATH.md`](docs/QUIZ_NEON_HOT_PATH.md) | Binding rules for start / submit / result on Neon |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | ADR-style log (why each choice landed) |
| [`docs/DEPLOY.md`](docs/DEPLOY.md) | Production Neon + Vercel + domain |
| [`docs/CONTENT_PIPELINE.md`](docs/CONTENT_PIPELINE.md) | Draft JSON → import → publish |
| [`docs/QUESTION_I18N.md`](docs/QUESTION_I18N.md) | RU/EN question and option rules |
| [`docs/QUIZ_IMAGES.md`](docs/QUIZ_IMAGES.md) | IMAGE_GUESS assets and optimize pipeline |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Product growth (next: mixed-difficulty quiz) |

Quiz setup URL: `/:locale/quiz` (not `/quiz/setup`).

## Testing

Unit tests cover pure domain rules (scoring, publish quality, cycle draw, filter parse, …). They do **not** talk to Neon.

```bash
npm run test
```

CI: `.github/workflows/test.yml` runs the same command on push/PR to `master`. Fragile Windows + Neon paths stay as manual/`scripts/smoke-*.cjs` checks.
