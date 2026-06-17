# GameMind

Video game quiz platform built with Next.js, TypeScript, PostgreSQL (Neon), Prisma, and Auth.js.

## Stack

- **Next.js 16** (App Router)
- **TypeScript**
- **PostgreSQL** via [Neon](https://neon.tech)
- **Prisma ORM**
- **Auth.js** (`next-auth` v5)
- **Tailwind CSS**

## MVP decisions

| Decision | Choice |
|----------|--------|
| Database | Neon (pooled `DATABASE_URL` + direct `DATABASE_URL_UNPOOLED`) |
| Auth | Auth.js with JWT sessions |
| Leaderboard | Best score per user (all time) |

## Project structure

```txt
src/
  app/           # routes, layouts, API handlers
  features/      # auth, quiz, leaderboard, admin
  entities/      # Prisma data access
  lib/           # prisma client, auth config
  shared/        # UI, utils, validation
  types/
prisma/
  schema.prisma
  seed.ts
```

## Getting started

1. Copy env file and fill in Neon credentials:

   ```bash
   cp .env.example .env
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Generate Prisma client and run migrations:

   ```bash
   npm run db:generate
   npm run db:migrate
   ```

4. Start the dev server:

   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Run migrations (dev) |
| `npm run db:seed` | Seed sample questions |
| `npm run db:studio` | Open Prisma Studio |

## Current status

- [x] Feature-based folder scaffold
- [x] Prisma schema (User, Question, QuizSession, QuizResult, Auth.js models)
- [x] Auth.js route handler and middleware skeleton
- [ ] Neon database connected
- [ ] First migration applied
- [ ] Seed questions
- [ ] Quiz flow
- [ ] Auth (credentials provider)
- [ ] Leaderboard
- [ ] Admin panel

## Next step

Connect Neon, apply the first migration, and add seed data for quiz questions.
