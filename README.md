# GameMind

Video game quiz platform — bilingual (`ru` / `en`), with image-guess questions, leaderboard, and an admin panel.

**Live:** [https://www.game-mind.ru](https://www.game-mind.ru) (also `game-mind.ru` → www)

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **PostgreSQL** via [Neon](https://neon.tech) (separate local / production projects)
- **Prisma ORM** + direct `pg` for Neon-critical quiz/admin paths
- **Auth.js** (`next-auth` v5) — credentials + JWT sessions
- **Tailwind CSS** — light/dark theme via CSS variables
- **Deploy:** Vercel Hobby + custom domain (REG.RU DNS)

## What works today (MVP+)

- Register / login / logout; roles `USER` | `ADMIN`
- Quiz setup → session with frozen JSON snapshot (anti-cheat) → submit → result
- Question types: `TEXT`, `IMAGE_GUESS` (WebP under `public/quiz-images/`)
- 60 bilingual seed questions (20 per difficulty; 9 with images)
- Leaderboard (best score per user)
- Admin: create / edit / deactivate / activate / delete questions (ru + en)
- Locale routes `/ru/...`, `/en/...` for UI **and** quiz content

## MVP decisions

| Decision | Choice |
|----------|--------|
| Database | Neon — pooled `DATABASE_URL` + direct `DATABASE_URL_UNPOOLED` |
| Auth | Auth.js JWT; `id`, `username`, `role` in session |
| Quiz integrity | Server scoring from session snapshot (`optionId`), never client score |
| Leaderboard | Best `QuizResult.score` per user (all-time) |
| Images (MVP) | Files in git `public/quiz-images/`; R2 upload later |
| Production URL | `https://www.game-mind.ru` |

## Project structure

```txt
src/
  app/           # [locale] routes, layouts, API handlers
  features/      # auth, quiz, leaderboard, admin
  entities/      # data access (Prisma / direct pg)
  lib/           # prisma, auth, db helpers
  shared/        # UI, i18n, utils
  types/
prisma/
  schema.prisma
  migrations/
scripts/         # seed, image optimize, Windows migration helpers
docs/            # DEPLOY.md, QUIZ_IMAGES.md (+ local continuity gitignored)
```

## Getting started (local)

1. Copy env and fill Neon **local** credentials (see `.env.example`):

   ```bash
   cp .env.example .env
   ```

2. Install and generate:

   ```bash
   npm install
   npm run db:generate
   ```

3. Apply migrations (on Windows prefer helpers if `prisma migrate` hits `P1017` — see below).

4. Seed (optional):

   ```bash
   npm run db:seed
   npm run images:update-db
   ```

5. Dev server:

   ```bash
   npm run dev
   ```

Open [http://localhost:3000/ru](http://localhost:3000/ru).

**Important:** keep local and production Neon URLs separate. Do not comment out `DATABASE_*` lines in `.env` — some scripts regex-match commented values. Use distinct `PROD_*` names or a temporary swap with restore.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Dev server |
| `npm run build` | `prisma generate` + production build |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Prisma migrate dev |
| `npm run db:seed` | Seed bilingual questions |
| `npm run db:studio` | Prisma Studio |
| `npm run images:optimize` | Raw → WebP pipeline |
| `npm run images:update-db` | Point `QuestionAsset` URLs at WebP |

## Deploy

See **`docs/DEPLOY.md`**. Summary:

1. Prod Neon: migrate + seed + admin user  
2. Vercel env: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `AUTH_SECRET`, `AUTH_URL`  
3. Domain DNS → Vercel; set `AUTH_URL` to `https://www.game-mind.ru` and redeploy  

## Next product work

Planned post-launch slice (details in local `docs/PROJECT_CONTEXT.md` / `ROADMAP.md` §11):

1. Auto sign-in after registration  
2. Result page — review wrong/right answers from snapshot  
3. Weighted points by difficulty (EASY/MEDIUM/HARD)  
4. Profile — change password, avatar, result history  
5. Admin — user list / role / delete (and soft-disable)  

## Neon setup notes

Use **two different** connection strings:

| Variable | Neon tab | Hostname |
|----------|----------|----------|
| `DATABASE_URL` | Pooled | contains `-pooler`, add `&pgbouncer=true` |
| `DATABASE_URL_UNPOOLED` | Direct | **without** `-pooler` |

Do **not** paste the same string into both.

On Windows, `prisma migrate dev` may fail with `P1017`. Prefer:

```bash
node scripts/apply-named-migration.cjs <migration_folder_name>
```

Or run migrate from WSL / Linux / CI. See also `docs/DEPLOY.md` and `docs/QUIZ_IMAGES.md`.
