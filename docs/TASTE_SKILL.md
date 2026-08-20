# GameMind — Taste Skill Continuity

Local working memory for **UI/UX identity** via [Taste Skill](https://www.tasteskill.dev/) ([GitHub](https://github.com/Leonxlnx/taste-skill)).
Gitignored local continuity file. Update this file on every Taste / UI visual session.

Related: `PROJECT_CONTEXT.md`, `ROADMAP.md` §11.8 + **§11.9**, `DECISIONS.md` → Taste Skill Visual Identity + Perceived Performance.

---

## 0. Operating model (read first)

Taste Skill is **not** a one-week cosmetic sprint and then forget.

| Layer | What | When |
|-------|------|------|
| **Foundation pass (§11.8)** | Audit → design lock → Wave A/B across existing screens | After Epic 4 (avatar) + Epic 5 (admin users) on prod |
| **Ongoing discipline** | Every new screen / visual change follows locked system + Taste rules | Forever after foundation (and optionally light adherence for pre-foundation UI) |
| **This file** | Brief, lock, inventory, prompts, **change log** | Update every UI session |

**Priority rule:** product features can ship before foundation, but UI must not invent a second visual language. After §11.8, new features **extend** the lock — they do not redesign from scratch.

```txt
Now → 11.1–11.5 live on prod (July 18) ✓
        ↓
§11.9 light perceived-performance (loaders/pending) anytime
        ↓
§11.8 Foundation (audit + lock + waves) — style loaders with the lock
        ↓
Every later epic: Prompt T-Feature + log here
        ↓
Phase 5 modes / achievements inherit the system
```

---

## 1. Status

| Field | Value |
|-------|--------|
| **Status** | `ongoing` — foundation §11.8 **closed** (Wave A + Wave B on prod) |
| **Product stage** | **public beta** (live at www.game-mind.ru) |
| **Last updated** | 2026-08-20 (interim brand mark: header GM + favicon chevrons) |
| **Skills installed** | Yes — `redesign-existing-projects` + `design-taste-frontend` (v2) in `.agents/skills/` |
| **Design system locked** | Yes in code — **Scoreboard Editorial** (`globals.css` tokens + Oswald / IBM Plex Sans / IBM Plex Mono via `@fontsource`) |
| **Direction name** | Scoreboard Editorial |
| **Wave A (public)** | **Done on prod** — §14 Tasks 1–9 + redeploy/smoke |
| **Wave B (account/admin)** | **Done on prod** — Profile → Admin → a11y → history mobile → redeploy + smoke |
| **Ongoing mode** | **Active** — every new feature UI extends the lock (Prompt T-Feature + §7) |
| **Related: §11.9 Perceived performance** | Light July 18 + **pending spinner pass** July 28 (`PendingSpinner` / `SubmitButton`) |

**Next:** interim brand mark **smoke OK** (user 2026-08-20). Commit brand + pending lobby/Survival/review when asked. Brand mark v2 = separate Taste chat (§14). Survival wave 2 = new chat.

---

## 2. Project UI analysis (baseline — July 17, 2026)

### 2.1 What the product is (for Taste brief inference)

- **Product:** bilingual video-game quiz (TEXT + IMAGE_GUESS), live at `https://www.game-mind.ru`
- **Audience:** friends demo + portfolio; RU primary, EN supported
- **Jobs to be done:** register → quiz → result/review → leaderboard; return via profile history; admin manages questions/users
- **Mood target:** sharp, playful, competitive-but-clean — not corporate SaaS, not neon gamer-slop, not purple gradient template
- **Stack UI:** Next.js App Router, React, Tailwind v4 + CSS variables, `data-theme` light/dark, dictionaries `ru`/`en`
- **Architecture:** feature-based (`features/`, `entities/`, `shared/ui`); Server Components default

### 2.2 Screen inventory

| Route (under `/[locale]`) | Role | UI maturity | Notes for Taste |
|---------------------------|------|-------------|-----------------|
| `/` home | public | **brand invite** | Hero + status-aware CTA row (`HomeCtaGroup`); **no** full mode cards |
| `/login`, `/register` | auth | functional | Forms; confirmPassword done |
| `/quiz` setup | **mode lobby** | functional | Sole Daily + Timed + Classic; Classic start = primary |
| `/quiz/[sessionId]` | user | strongest so far | QuestionCard, progress, IMAGE_GUESS full-frame + **lightbox** (click/tap/keys dismiss; black scrim) |
| `/result/[sessionId]` | owner | good structure | Summary + review filters; IMAGE_GUESS lightbox same component |
| `/leaderboard` | public | **scoreboard + mode + period + difficulty** | Phone strip + sm+ table; podium 1–3; segmented `?mode=` → `?period=` (week default) → `?difficulty=` |
| `/profile` | user | **identity strip + dense stats 2×2/4-col + 2-col mid + compact achievements + settings details** | order: strip → stats/achievements\|history → settings; stats = full-width 2×2 until lg |
| `/admin` | admin | **home counts + Scoreboard polish** | Sessions strip; Questions 2×2 (status × format); Users total caption |
| `/admin/questions` (+ new/edit) | admin | **paginated list + draft/bulk + contextual toolbar** | `?page=` (25/page); checkboxes; toolbar Visibility/Publication; desktop Edit + more; publication filter; edit quality panel |
| `/admin/users` | admin | **questions-pattern list** | cards `&lt;lg`; sticky nowrap actions `lg+`; link → detail |
| `/admin/users/[id]` | admin | **profile-pattern history** | read-only card; history like ProfileResultHistory; no Обзор |

### 2.3 Design-system baseline (today)

**Strengths (preserve):**

- Semantic tokens in `src/app/globals.css` (`background`, `foreground`, `surface*`, `primary*`, `danger/success/warning`, `info`, `ring`, radii, shadows)
- Tailwind via `@theme inline` — use `bg-primary`, `text-muted`, etc.
- Dual theme light/dark already wired
- Quiz session UX already more intentional than rest of app
- IMAGE_GUESS: native `<img>`, full-frame, no 16:9 crop — **do not regress**

**Weaknesses (Taste must fix in foundation):**

- Palette is near-default neutral black/white — little brand identity
- Fonts: **Geist / Geist_Mono** (`layout.tsx`) — readable but common in AI Next apps; foundation should pick a more distinctive pairing (still load via `next/font`)
- Little motion / presence hierarchy on home and result
- Shared UI primitives are thin (`site-header`, theme/language toggles only) — no Button/Input/Card system yet
- Inconsistent polish: quiz > auth/home/leaderboard/admin
- Empty/loading/error states uneven outside quiz/admin list

### 2.4 Hard constraints (never violate in Taste PRs)

Copy into every Taste prompt:

1. Presentation only — no Prisma / direct `pg` / snapshot / scoring changes
2. Keep i18n dictionaries; no hardcoded UI strings
3. Keep CSS variable theme system; extend tokens, don’t invent parallel colors in components
4. Server Components default; Client only for interactivity
5. IMAGE_GUESS full-frame preserved
6. Role-aware nav is UX only; auth stays server-side
7. One visual PR / wave; no mix with §11.7 repo split
8. Mentor workflow: user usually writes code; AI directs unless “реализуй”

### 2.5 Suggested Taste dials (starting point)

Adjust after audit; record final lock in §4.

| Dial | Start | Rationale |
|------|-------|-----------|
| DESIGN_VARIANCE | 5 | Distinct brand, not chaotic asymmetry |
| MOTION_INTENSITY | 4 | Presence on home/result; **quiz answer UI stays calm** (≤3 local) |
| VISUAL_DENSITY | 5 public / 7 admin | Spacious product flows; dense admin tables OK |

### 2.6 Skills to use

| Skill install name | Role |
|--------------------|------|
| `redesign-existing-projects` | Foundation audit + redesign of existing app |
| `design-taste-frontend` | v2 default rules + dials during implementation |
| `high-end-visual-design` **or** `minimalist-ui` | Pick **one** overlay after audit (not both) |
| `imagegen-frontend-web` / `brandkit` | Optional comps before code |
| `full-output-enforcement` | Only if agent truncates |

**Not primary:** greenfield-only prompts that ignore existing routes; `industrial-brutalist-ui` (poor fit for bilingual quiz product unless brief changes).

---

## 3. Product brief (locked for agents)

Update if product positioning changes; keep short.

```txt
Product: GameMind — bilingual (ru/en) video game quiz web app.
Stage: public beta (live portfolio product, not private MVP).
Live: www.game-mind.ru. Portfolio + friends.

Audience: gamers and curious friends; not enterprise admins as primary users.
Admin is secondary: dense, clear, not “marketing pretty”.

Visual goal: original, memorable, anti-slop. Sharp / playful / competitive-but-clean.
Avoid: purple SaaS gradients, generic Inter dashboards, cream-serif terracotta clichés,
       neon cyberpunk overload, emoji decoration, card soup on marketing surfaces.

Must: light + dark parity; mobile-first quiz; large tap targets on options;
      calm motion during answering; expressive motion OK on home/result/leaderboard entry.
Brand: “GameMind” must read as the hero on the home first viewport.
Stack: Next.js App Router, Tailwind tokens in globals.css, feature folders, i18n dictionaries.
```

---

## 4. Design system lock

**Status:** **locked in code** (Task 1+). Extend tokens in `globals.css`; do not invent parallel palettes in components.

### 4.1 Direction name

- **Scoreboard Editorial** — sharp, competitive-but-clean, editorial game-press / scoreboard feel. Not neon casino, not purple SaaS, not marketing landing, not glassmorphism.

### 4.2 Typography

| Role | Choice | Notes |
|------|--------|-------|
| Display / brand | **Oswald** (`font-display`) | Self-hosted `@fontsource` (not Geist / Inter) |
| Body / UI | **IBM Plex Sans** (`font-sans`) | Readable for long questions + RU/EN |
| Mono / tabular | **IBM Plex Mono** (`font-mono`) | Scores, progress `answered/total`, admin ids |

### 4.3 Color (map to CSS variables)

| Token | Light | Dark | Meaning |
|-------|-------|------|---------|
| `--background` | `#f3f5f7` | `#0c0f14` | Cool paper / charcoal |
| `--foreground` | `#14181f` | `#e8ecf1` | Primary text |
| `--primary` | `#0b6e4f` | `#3ecf8e` | Competitive teal accent |
| `--surface` / `--surface-muted` | `#fff` / `#e9eef3` | `#141922` / `#1a212c` | Cards / muted blocks |
| `--success` / `--danger` / `--warning` | semantic | semantic | Never status-by-color-only |
| `--info` / `--info-muted` | `#1f5f8b` / `#e4eef6` | `#7eb6d9` / `#143044` | Cool link / secondary accent (not teal) |
| `--podium-gold` / `-fg` | `#e8c547` / `#2a2208` | `#3d3418` / `#f0d56a` | Leaderboard rank 1 medal |
| `--podium-silver` / `-fg` | `#c5ccd6` / `#1e2430` | `#2a3038` / `#c8d0db` | Leaderboard rank 2 medal |
| `--podium-bronze` / `-fg` | `#c9894a` / `#2a1808` | `#3a2a1c` / `#e0b080` | Leaderboard rank 3 medal |
| `--ring` | `#0b6e4f` | `#3ecf8e` | Focus |

### 4.4 Space / radius / motion

- Spacing scale: 4 / 8 / 12 / 16 / 24 (Tailwind-friendly)
- Radii: keep `--radius-sm|md|lg` contract
- Motion: home/result presence OK (dial ~4); quiz answer UI calm (local ≤3); **`prefers-reduced-motion` global** (Task 9)
- Anti: glass panels, decorative orbs, heavy gradients, card soup

### 4.5 Component primitives to introduce (shared)

Introduced / in use:

- Button (primary / secondary / ghost / danger)
- InlineAlert, EmptyState, Skeleton (+ route PageSkeleton)
- SubmitButton (`aria-busy`), PendingLink
- SiteHeader + SiteMobileMenu (a11y: skip link, landmarks, focus restore)
- GameMindMark (interim header lockup; not locked identity)

Still optional later: Input/Label Field system, PageShell, denser Table shell.

Prefer `src/shared/ui/*` + tokens — not one-off page CSS.

### 4.6 Suggested dials (from 2026-07-21 audit)

| Dial | Value | Rationale |
|------|-------|-----------|
| DESIGN_VARIANCE | 5 | Distinct brand, not chaotic |
| MOTION_INTENSITY | 4 overall; ≤3 on quiz options | Presence on home/result; calm answering |
| VISUAL_DENSITY | 5 public / 7 admin | Spacious product; dense admin OK |

### 4.7 Brand mark (interim — 2026-08-20)

Not a locked identity. Replace when a more intentional logo exists.

| Surface | Mark | File |
|---------|------|------|
| Favicon / Apple | B — rank chevrons (16px-safe) | `src/app/icon.svg`, `src/app/apple-icon.png` |
| Header lockup | A — GM + primary bar, no charcoal tile | `src/shared/ui/game-mind-mark.tsx` |
| Drafts / preview | A, B, C | `docs/brand/` |

Anti: gamepad, `?`, neon, second palette. Wordmark stays text (`dictionary.metadata.title`), not a PNG.

---

## 5. Wave plan (§11.8)

### Wave 0 — Setup

- [x] Install skills (commands in §8)
- [x] Confirm agent loads Taste + this file
- [x] Run Prompt T-Audit → paste findings into §6 (2026-07-21)
- [x] Canonize UI/UX strategy §13 + backlog §14
- [x] Lock design system §4 **in code** (Task 1: tokens + fonts)
- [ ] Optional: Stitch/Pencil comps → attach to chat (specs only, no paste-codegen)

### Wave A — Public product

Order (one screen or tight pair per session; prefer §14 task IDs):

1. [x] Design tokens + fonts in `globals.css` + `@fontsource` (**Task 1**)
2. [x] Shared Button + focus states (**Task 2**); Home brand hero (**Task 1b**)
3. [x] Auth (login + register) — token / shared feedback cleanup (via Tasks 1+8)
4. [x] Quiz setup — mobile + tokens (Task 7)
5. [x] Quiz session: options, progress, question polish (**Tasks 3–5, 7**)
6. [x] Result + review (**Task 6**)
7. [x] Leaderboard — empty/feedback wired (Task 8); denser column polish optional later
8. [x] Loading/error/empty system + a11y smoke (**Tasks 8–9**)
9. [x] Redeploy + smoke on `www.game-mind.ru` (2026-07-21 evening — user-verified)

### Wave B — Account + admin

1. [x] Profile (incl. avatar UI)
2. [x] Admin questions list/forms
3. [x] Admin users (after Epic 5 exists)
4. [x] A11y pass both themes (**incl. active nav `aria-current` + visual highlight** — 2026-07-21)
5. [x] Profile history mobile overflow (2026-07-21)
6. [x] Redeploy + smoke on `www.game-mind.ru` (2026-07-22 — user-verified)

**Backlog (do not forget):**

- [x] **Active nav highlight** — desktop + mobile: current route visually distinct + `aria-current="page"`. Helper `nav-active.ts`; wired in `site-header.tsx`, `site-mobile-menu.tsx`, `HeaderAuthControls` (login/register + profile avatar). Match via `removeLocaleFromPathname`; home `/` exact; `/admin` matches `/admin/*`.
- [x] **Profile history mobile overflow** — phone (&lt;480): dense «Очки N · Верно N из M»; **≥480: table**. `historyOf` i18n. `AppSiteHeader` key fix. Done 2026-07-22.

**Plan — Profile history mobile (перед redeploy):**

| | |
|--|--|
| **Goal** | История результатов читаема на узком экране без «съезда» колонок за край viewport |
| **Approach** | Оставить **таблицу** (Scoreboard Editorial, как admin). Не карточки на MVP |
| **How** | 1) wrapper: `overflow-x-auto` + optional `-mx-4 px-4` bleed к краю `main`; 2) table: `min-w-[36rem]` или `w-max min-w-full` (чтобы появился горизонтальный scroll); 3) ячейки даты/чисел: `whitespace-nowrap`; 4) focus-visible на «Открыть» уже есть |
| **File** | `src/features/profile/components/ProfileResultHistory.tsx` only |
| **Out of scope** | prisma, history query, i18n keys (labels already exist), card redesign |
| **Verify** | DevTools 333×470 и 390×844; light/dark; ru/en; скролл до колонки «Открыть»; desktop без регресса |
| **Order** | 1) commit a11y active nav → 2) **этот polish** → 3) Wave B redeploy + smoke |

### Ongoing

- [ ] Any new feature UI → Prompt T-Feature + §7 change log entry
- [ ] Quarterly Prompt T-Audit-Lite if UI drifts

---

## 6. Audit log

### Audit — 2026-07-21 (senior product / UX / frontend boundaries)

**Keep (strengths):** semantic tokens in `globals.css`; quiz progress + sticky submit; `radiogroup` + `focus-within`; IMAGE_GUESS full-frame + loading/error; result review filters + text status labels; i18n dictionaries; Server Components default; §11.9 route skeletons / pending UI.

**Note:** no per-question timer in product yet (Timed mode = Phase 5). Session shows **all questions at once**; progress = answered/total.

#### P0

| ID | Issue | Recommendation | Safe files | Logic risk |
|----|-------|----------------|------------|------------|
| P0-1 | No design lock in code; home/auth/theme use `neutral-*` drift | Lock Scoreboard Editorial tokens + fonts first | `globals.css`, `layout.tsx` | Low |
| P0-2 | Home fails brand test; no CTA to quiz | Brand hero + one CTA → `/quiz` | home `page.tsx`, home i18n | Low |

#### P1

| ID | Issue | Recommendation | Safe files | Logic risk |
|----|-------|----------------|------------|------------|
| P1-1 | All-questions scroll overload on mobile | Sticky progress, emphasize unanswered; do **not** change to one-question flow without explicit decision | `QuizSessionForm`, `QuestionCard` | Low (CSS); medium if flow change |
| P1-2 | Disabled submit unexplained | Helper + `aria-describedby`; keep `allAnswered` rule | `QuizSessionForm`, quiz i18n | Low |
| P1-3 | Selected option too subtle | Stronger selected border/bg + indicator; not color-only | `QuestionCard` | Low |
| P1-4 | Result summary weak motivation | Large score hierarchy + CTAs; keep server score | result `page.tsx` | Low |
| P1-5 | Token inconsistency outside quiz | Semantic tokens only | home, auth, `theme-toggle`, `skeleton`, alerts | Low |
| P1-6 | Long text + IMAGE_GUESS on small screens | Spacing/leading; **no crop** | `QuestionCard`, `QuestionImage` | Low |

#### P2

Sticky glass-ish bar → solid background; introduce Button/Input primitives; Geist → distinctive fonts; empty/error system; motion presence on home/result; axe now, Playwright later; leaderboard polish after quiz/result.

**Safe UI surface:** `src/app/globals.css`, `layout.tsx`, `src/shared/ui/**`, quiz **components** (presentation), page layout classes, i18n UX copy, `loading.tsx`.

**Do not touch for UI:** `features/quiz/actions`, `scoring.ts`, `validation.ts`, entities repositories, `lib/db`, `lib/auth`, `api/**`, prisma/migrations.

---

## 7. Change log (append every UI session)

Format:

```txt
### YYYY-MM-DD — <short title>
- Scope: Wave A|B|Feature:<name>|Fix
- Skills used: ...
- Files touched: ...
- What changed visually: ...
- Tokens/components added: ...
- Explicitly NOT changed: (db, scoring, ...)
- Verify: light/dark, ru/en, mobile quiz
- Follow-up: ...
```

### 2026-08-20 — Interim brand mark (favicon + header lockup)

- Scope: Feature:brand / Prompt T-Feature (presentation only)
- Skills used: gamemind-taste-ui
- Files touched: `src/app/icon.svg`, `src/app/apple-icon.png`, `game-mind-mark.tsx`, `site-header.tsx`, `docs/brand/*`, TASTE §4.7
- What changed visually: tab/Apple = rank chevrons; header lockup = GM + primary bar on transparent (no charcoal tile — AA fringe on light surface)
- Tokens/components added: `GameMindMark` (interim, not locked)
- Explicitly NOT changed: scoring, snapshot, Prisma, Auth, quiz hot path
- Verify: **OK** (user 2026-08-20) — header light/dark; logo / «Главная» after Direct queue restart; tab icon
- Follow-up: brand mark v2 when a more intentional logo exists (§14); no charcoal tile in header (AA fringe on light surface)

### 2026-08-20 — Survival last lock-in auto-submit (no finish CTA)

- Scope: Feature:Survival end-of-wave
- Skills used: gamemind-taste-ui (sticky chrome only)
- Files touched: `SurvivalQuizSessionForm.tsx`, i18n `savingAnswers`
- What changed visually: full 12 lock-ins with bank > 0 → spinner «Сохраняем волну…» and redirect; Finish CTA only after a failed hop
- Tokens/components added: none
- Explicitly NOT changed: scoring, snapshot, Direct complete hop, wave 2
- Verify: Survival HARD 12 all-correct → result without a finish click; bank=0 mid-wave still auto-saves
- Follow-up: wave 2 prompt in PROJECT_CONTEXT

### 2026-08-20 — Lobby + leaderboard: equal arenas, compact board, living copy

- Scope: Feature:lobby/leaderboard copy + filter chrome / Prompt T-Feature
- Skills used: gamemind-taste-ui, design-taste-frontend (Scoreboard Editorial)
- Files touched: i18n ru/en + dictionary types; Survival CTA variant; lobby cards; leaderboard page + filter chrome; `leaderboard-filter-chrome.ts`
- What changed visually:
  - Survival start CTA = **primary** (same green as Blitz/Classic — equal arena, not a ghost guest);
  - mode chips **2×2 on narrow**, difficulty **3+2 wrap**; chip text nowrap;
  - leaderboard hero = title + one line + filters + table; scoring rules in `<details>` under the board;
  - lobby copy: short hooks, mechanics in meta; Survival title **Выживание**, eyebrow **Банк времени** (was «Одна волна»).
- Tokens/components added: shared filter chrome helper (no new palette)
- Explicitly NOT changed: scoring, snapshot, Direct/hot path, Prisma, Auth
- Verify: `/ru/quiz` Survival green CTA; `/ru/leaderboard` 320 no clipped «Выживание»; light/dark; ru/en
- Follow-up: commit when user smoke OK

### 2026-08-20 — Result review: hide unanswered (no correct-option spoiler)

- Scope: Feature:Result review
- Skills used: gamemind-taste-ui
- Files touched: `map-compact-review-payload.ts`, `map-quiz-result-review.ts`, review API + section + client loader
- What changed visually: Ошибки / Верные / Все — только вопросы с выбранным ответом; неотвеченные не в списке и без `correctOption`
- Tokens/components added: none
- Explicitly NOT changed: scoring, complete hop, Direct, snapshot, `buildCompactReviewPayload`, `survivalClockOk`
- Verify: Survival mid-wave; Blitz timer partial; Classic all-answered; summary `n из total` unchanged
- Follow-up: none

### 2026-08-19 — Survival lobby copy (not a second visual world)

- Scope: Feature:Survival / Prompt T-Feature lite
- Skills used: gamemind-taste-ui
- Files touched: `ru.ts` / `en.ts` `survivalMode` + `quiz.setupDescription`
- What changed visually: same Timed CTA chrome; title **Одна волна** (was «Волна на банке»); dropped «Mix нет» / EASY|MEDIUM|HARD shout in meta
- Tokens/components added: none
- Explicitly NOT changed: scoring, snapshot, Timed clock, layout
- Verify: `/ru/quiz` Survival card; light/dark; ru/en
- Follow-up: Chat E submit; ADR 6–7 board polish later

### 2026-08-19 — Survival lobby CTA (thin, Scoreboard Editorial)

- Scope: Feature:Survival / Prompt T-Feature lite (not ADR §7 polish)
- Skills used: gamemind-taste-ui
- Files touched: `SurvivalModeCta.tsx`, `SurvivalModeCtaPanel.tsx`, `quiz/page.tsx`, i18n `survivalMode`
- What changed visually:
  - thin lobby card under Blitz: eyebrow / title / meta / EASY|MEDIUM|HARD select (no Mix);
  - secondary start button so it does not compete with Blitz/Classic primary.
- Tokens/components added: reuse Timed CTA chrome (`border-border`, `font-display`, hairline meta)
- Explicitly NOT changed: scoring, snapshot JSONB, Timed clock, Survival board chip, «wave record» copy, home
- Verify: `/ru/quiz` Survival card; guest login; light/dark; ru/en; 390px
- Follow-up: Chat E submit + clockOk; ADR 6–7 Taste polish later

### 2026-08-19 — Leaderboard retention Layer 1 (week default + mode boards)

- Scope: Feature:Leaderboard meta / Prompt T-Feature (Scoreboard Editorial)
- Skills used: gamemind-taste-ui
- Files touched: `leaderboard-mode-filters.tsx`, period/difficulty filters, `leaderboard/page.tsx`, parse + `findBestScores`, i18n, Classic/Blitz lobby captions
- What changed visually:
  - third segmented control **Режим** (Классика / Блиц / Челлендж) above period;
  - period chips reordered **Неделя → Месяц → Всё время**; week is the live default;
  - muted captions under title: 7-day window / all-time records / Blitz speed;
  - Classic + Blitz lobby: one `text-xs` line under meta (not a modal).
- Tokens/components added: `LeaderboardModeFilters` (same chrome as period)
- Explicitly NOT changed: scoring, snapshot, submit/complete, Timed clock, Survival, calendar Monday reset
- Verify: `/ru/leaderboard` week selected; `?period=all`; `?mode=blitz`; lobby Classic/Blitz captions; light/dark; ru/en; 390px three mode chips; **user smoke OK 2026-08-19** (local)
- Follow-up: commit + www smoke so HARD 30 no longer locks the live board for friends

### 2026-08-18 — Admin hub: TEXT / IMAGE_GUESS glance + card rhythm

- Scope: Feature:Admin QoL / Prompt T-Feature (Scoreboard Editorial)
- Skills used: gamemind-taste-ui
- Files touched: `src/app/[locale]/admin/page.tsx`, `src/app/[locale]/admin/loading.tsx`, `src/entities/admin/admin-home.repository.ts`, i18n `admin.homeStatQuestionsImage` / `homeStatQuestionsText` / `homeStatUsers`
- What changed visually:
  - Questions card: 2×2 `<dl>` (Active | Inactive, then Image | Text);
  - hairline between status and format rows; same mono tabular values as Active; Inactive stays `text-muted`;
  - equal hairline padding (`pt-4`); descriptions `mt-auto` so both card footers share a baseline on `sm+`;
  - Users card: same dt/dd chrome; caption **Всего** / **Total** (not a second «Пользователи»);
  - hub loading: sessions strip pulse + taller cards, padding matches live page.
- Tokens/components added: local `HubStat` on the hub page (not a shared primitive)
- Explicitly NOT changed: extra user metrics; questions list/filters/bulk; Prisma/migrations; quiz hot path; Taste tokens/fonts; nested `?type=` links; icons/badges/charts
- Verify: `/ru/admin` + `/en/admin` light/dark; 320 + desktop; Image + Text === Active + Inactive; both cards one link; focus ring intact; **user smoke OK 2026-08-18**
- Follow-up: none for this slice

### 2026-08-17 — Mix lobby meta: очки, not веса

- Scope: Fix:UX copy / Prompt T-Feature light
- Files: `ru.ts` / `en.ts` `quiz.mixedSplitMeta*`
- What changed visually: lobby mix line `веса` → `очки` (EN `weights` → `points`); Classic + Blitz, all three sizes
- Explicitly NOT changed: scoring weights, mix split, Prisma
- Verify: `/quiz` Classic MIX 3 — «очки 1 / 2 / 3»
- Related: Quiz Arcade marks **verified on www** (user, Aug 17) — see §7 2026-08-16

### 2026-08-16 — Achievement illustration semantics (Quiz Arcade)

- Scope: Feature:Achievements / Prompt T-Feature (presentation + copy)
- Skills used: gamemind-taste-ui (Scoreboard Editorial)
- Files touched: `achievements/illustrations/index.tsx`, i18n `achievements.items` + `leaderboard.filterMixed`, `leaderboard-difficulty-filters` comment
- What changed visually: Quiz Arcade plaque pack (round card / combo / S-rank / daily stamp / stopwatch+bolt / scoreboard 250 / rank pips); HARD_3 stays inside plaque; HIGH_ACCURACY_90 is a gapped ring (not a clock); medium triangles vs hard diamonds; titles `Начало` / `Оба режима`; filter chip **Микс**
- Tokens/components added: none (same plaque + `currentColor`)
- Explicitly NOT changed: types, evaluate, award, Prisma, snapshot, scoring
- Verify: `/profile` light/dark ru/en; locked vs unlocked; toast sm; HARD_3 clip; blitz = dial+bolt; **www smoke OK 2026-08-17** (user)
- Follow-up: new badges follow DECISIONS → Achievements MVP → Illustration pack (Quiz Arcade)
- Canon: `docs/DECISIONS.md` Achievements MVP (how to add + pack rules)

### 2026-08-07 — IMAGE_GUESS lightbox mobile pinch-zoom

- Scope: Fix:quiz-image-lightbox
- Files: `QuestionImage`, i18n hint
- What changed: touch no longer dismisses on pointerdown; pinch-zoom (1×–4×) + pan when zoomed; single tap closes at 1× or resets zoom when pinch-active; desktop click/keys unchanged; black scrim kept
- Explicitly NOT changed: scoring, snapshot, import
- Verify: phone IMAGE_GUESS open → pinch → pan → tap reset → tap close; desktop click close

### 2026-08-06 — IMAGE_GUESS lightbox dismiss without Close button

- Scope: Feature:quiz-image-lightbox
- Files: `QuestionImage`, i18n hint copy
- What changed visually: no Close chrome; dismiss via click / any touch / Esc·Enter·Space·Backspace; `cursor-zoom-out`; ghost-tap guard ~280ms; scrim `black/55` → dark `black/80` (не `foreground` — в dark давал светлую вуаль); тонкий `ring-white/10` на кадре
- Explicitly NOT changed: scoring, snapshot, import, Prisma
- Verify: quiz + review; light/dark; mobile tap-open then tap-close; desktop click + Esc

### 2026-08-06 — IMAGE_GUESS lightbox (tap to enlarge)

- Scope: Feature:quiz-image-lightbox
- Skills used: gamemind-taste-ui (Scoreboard Editorial)
- Files: `QuestionImage`, `QuestionCard`, `QuizSessionForm`, `QuizResultReview`, i18n ru/en
- What changed visually: preview stays `object-contain`; click/tap → calm scrim dialog; Esc / backdrop / Close; mobile safe-area + large close hit; desktop `cursor-zoom-in` + hint under image; no glow / no crop
- Explicitly NOT changed: scoring, snapshot, Prisma, hot path
- Verify: quiz IMAGE_GUESS + result review; light/dark; mobile + desktop; Esc closes
- Follow-up: none for UX; content import separate

### 2026-08-04 — Admin questions list pagination (verified)

- Scope: Feature:admin-list-pagination + Fix (page≥3 timeout)
- Skills used: gamemind-taste-ui (Scoreboard dense admin)
- Files: `AdminQuestionsPagination`, filters/page parse, `question-admin.repository` (COUNT+LIMIT/OFFSET), i18n, smoke route
- What changed visually: «Показаны X–Y из Z»; mobile Prev/status/Next; desktop page numbers; spinner «Загрузка…» on hard-nav page change; ≤25 rows
- Explicitly NOT changed: quiz hot path, Prisma schema, scoring, snapshot
- Verify: page 1→2→3→4 OK (user); filter resets page; light/dark; bulk = current page only
- Follow-up: optional `createdAt` index if bank ≫1k

### 2026-08-02 — Classic start primary + docs sync

- Scope: Fix:UX / Prompt T-Feature
- Files: `QuizSetupForm` start → primary; continuity PROJECT_CONTEXT + TASTE §1/§2.2/§7
- What changed visually: «Начать классику» same green primary as «Начать блиц»
- Explicitly NOT changed: scoring/snapshot/auth
- Verify: `/quiz` Classic + Blitz both primary filled
- Follow-up: commit IA + content batch

### 2026-08-02 — Fix Classic lobby chrome + RU distractors

- Scope: Fix:UX + content
- Files: `QuizSetupForm` (quiz.classic* keys only), i18n; `seed-questions.cjs` + `fix-ru-answer-labels.cjs` (DOOM distractors + П-Боди)
- What changed: Classic card = Без таймера / Классика / meta (no duplicate outside card); DB RU labels for Duke/Doomguy/Blazkowicz/P-Body
- Explicitly NOT changed: scoring/snapshot shape; **already-open sessions keep frozen old option text**
- Verify: hard refresh `/quiz` Classic; **new** Daily/Classic session shows all RU options for DOOM question
- Follow-up: run `fix-ru-answer-labels.cjs` on prod if needed

### 2026-08-02 — Home / Quiz IA polish (CTA hierarchy + Classic face)

- Scope: Feature:UX-IA / Prompt T-Feature
- Skills used: gamemind-taste-ui
- Files: `HomeCtaGroup`(+panel), home `page.tsx`, quiz `page.tsx`, `QuizSetupForm`, `TimedModeCta`(+panel) `startVariant`, `DailyChallengeBoard` compact empty, i18n, removed dead home-tease link components
- What changed visually: Home in_progress → primary «Продолжить челлендж» + «Все режимы»; Classic card title/description/meta; empty board one line; Blitz secondary while Daily in progress; Daily copy less cheerleading
- Explicitly NOT changed: scoring, snapshot, auth, start action bodies
- Verify: unfinished Daily on Home shows continue as primary; lobby Classic looks like a mode; empty board not a big dashed box
- Follow-up: commit when ready

### 2026-08-02 — Home / Quiz IA: Landing + Mode Lobby

- Scope: Feature:UX-IA / Prompt T-Feature
- Skills used: gamemind-taste-ui, redesign-existing-projects
- Files: home `page.tsx`, quiz `page.tsx`, `QuizSetupForm`, result playAgain `PendingLink`, i18n ru/en + `dictionary.ts`, CTA file comments; **fix:** `DailyChallengeHomeTease` (+ panel) — Home tease starts/continues Daily instead of lobby link
- What changed visually: Home = brand + «Выбрать режим» + action tease Daily (no mode cards); `/quiz` = sole full Daily/Timed/Classic lobby; nav «Играть»/Play; Classic start secondary + «Начать классику»
- Tokens/components added: `home.dailyTease`; `#mode-daily` on lobby; home tease components
- Explicitly NOT changed: scoring, snapshot, auth, Daily/Timed start action bodies, Prisma
- Verify: `/` without Daily/Blitz cards; tease **starts** Daily (or continue/result/login); `/quiz` has all three; ru/en; light/dark; 390px
- Follow-up: optional lobby visual rank polish; commit when ready

### 2026-08-02 — Timed rematch + result review harden (presentation light)

- Scope: Feature:Timed / Prompt T-Feature light
- Skills used: n/a (logic + CTA wiring; Scoreboard tokens unchanged)
- Files: `TimedRematchButton.tsx`, `QuizResultSummary.tsx`, result page, `TimedModeCta` warm
- What changed visually: primary CTA on Timed result is SubmitButton «Реванш» (instant start), not Link to setup; review list reliable under score
- Explicitly NOT changed: scoring math, snapshot freeze, classic play-again Link
- Verify: Rematch → new Timed countdown; review rows visible; light/dark OK
- Follow-up: redeploy + prod RU label fix script

### 2026-08-01 — Timed abandon stuck sessions (no UI)

- Scope: Feature:Timed / logic only (not presentation)
- Skills used: n/a (no Taste visual pass)
- Files touched: `timed-mode/types.ts`, `quiz-session-start.repository.ts`, `start-timed-quiz.ts` (comment)
- What changed visually: **none** — silent `ABANDONED` on new Timed start
- Explicitly NOT changed: scoring, snapshot shape, classic/daily start, UI/i18n
- Neon: abandon on same `withPooledPgQuizStartClient` as INSERT (not separate DirectPg write)
- Verify: leave mid-Timed → start again → old `ABANDONED` in Studio; classic/daily untouched
- Follow-up: commit → redeploy → www smoke

### 2026-07-31 — Timed result roast plaque + review Suspense

- Scope: Feature:Timed / Prompt T-Feature
- Visual: `TimedClockRoastBanner` Scoreboard plaque (eyebrow/title/body, border-l-warning) instead of flat text alert
- UX: unanswered questions in review (timed partial); Suspense review so locale switch shows score first; `startTransition` on timer auto-submit
- Neon: result JOIN snapshot for max score in one read; review isolated soft-fail
- Verify: `?clock=1` plaque; filter «Ошибки» shows unanswered; RU↔EN score appears before review

### 2026-07-31 — Daily/Timed CTA copy polish

- Scope: Feature:Daily / Feature:Timed / Prompt T-Feature
- Copy: daily title/description/empty-board and timed title/description rewritten in Scoreboard Editorial tone
- EN: translated by meaning, not literal wording (`Today's challenge`, `Blitz round`)
- Logic: no behavior changes

### 2026-07-31 — Home hero copy polish

- Scope: Home hero / Prompt T-Feature
- Copy: RU hero moved toward atmospheric game-memory framing; EN mirrors the meaning naturally
- Logic: no behavior changes

### 2026-07-31 — Result/leaderboard/achievements copy polish

- Scope: Timed result / Leaderboard / Achievements / Prompt T-Feature
- Copy: softer timed result roast, clearer leaderboard filter description, more badge-like achievement titles
- EN: translated by meaning (`Attempt counted`, `Now there is a result to beat`)
- Logic: no behavior changes

### 2026-07-31 — Timed start DB_TIMEOUT + lively mode copy

- Scope: Feature:Timed/Daily / Prompt T-Feature
- What changed: catch Neon DirectPgTimeout on all quiz starts → InlineAlert `dbTimeout` (no 500); roast recovery + livelier RU/EN mode titles
- Explicitly NOT changed: snapshot/scoring math
- Verify: cold timeout shows friendly alert; retry works; classic/daily same path

### 2026-07-31 — Timed timeout UX (auto-submit + recovery)

- Scope: Feature:Timed Mode / Prompt T-Feature
- Skills used: gamemind-taste-ui
- Files touched: `QuizSessionForm`, `TimedQuizCountdown`, `QuestionCard` disabled, `submitQuizAction` partial timed, i18n
- What changed visually: on 00:00 auto-save + lock answers; if past grace — InlineAlert + Try again/Home (no fake Finish)
- Explicitly NOT changed: classic/daily ANSWER_ALL; scoring weights
- Verify: expire mid-quiz → result; expire after grace (offline) → recovery CTAs; classic unchanged
- Follow-up: none required for MVP

### 2026-07-31 — Timed + Daily CTA copy polish

- Scope: Feature:Timed/Daily / Prompt T-Feature (copy only)
- Skills used: gamemind-taste-ui
- Files touched: `ru.ts` / `en.ts` `dailyChallenge` + `timedMode` title/description
- What changed visually: human short titles/descriptions; length kept ~1–2 lines (no layout stretch)
- Explicitly NOT changed: meta/buttons/layout/components
- Verify: home cards still compact; ru/en
- Follow-up: prod migrate timedEndsAt

### 2026-07-31 — Timed Mode CTA (home + quiz setup)

- Scope: Feature:Timed Mode / Prompt T-Feature
- Skills used: gamemind-taste-ui
- Files touched: `TimedModeCta`, `TimedModeCtaPanel`, home + `/quiz` pages, i18n `timedMode.*`
- What changed visually: secondary Scoreboard panel under Daily — eyebrow/title/meta + difficulty + start; guest → login
- Tokens/components added: none (reuse surface/border/font-mono/display)
- Explicitly NOT changed: scoring, snapshot, submit gate, Daily CTA chrome
- Verify: guest login prompt; authed start → countdown; light/dark; ru/en; home brand still primary
- Follow-up: prod migrate `timedEndsAt` before www timed entry

### 2026-07-31 — Timed Mode countdown on quiz session

- Scope: Feature:Timed Mode / Prompt T-Feature (presentation island)
- Skills used: gamemind-taste-ui
- Files touched: `TimedQuizCountdown.tsx`, `QuizSessionForm`, quiz `[sessionId]` page, i18n `timedRemainingLabel` / `timedExpiredLabel`, reads return `timedEndsAt`
- What changed visually: sticky progress card shows `mm:ss` mono countdown when session is timed; expired → danger label; classic/daily unchanged
- Tokens/components added: `TimedQuizCountdown` (Scoreboard tabular / font-mono)
- Explicitly NOT changed: scoring, submit gate, snapshot write, CTA entry
- Verify: classic session no timer; timed session ticks; light/dark; ru/en
- Follow-up: submit `TIMED_OUT` gate; then CTA to start timed

### 2026-07-31 — Achievements criteria progress on profile

- Scope: Feature:Achievements progress / Prompt T-Feature
- Skills used: gamemind-taste-ui (presentation only)
- Files touched: `achievement-progress-metrics.ts`(+test), `types.ts`, `get-achievement-progress.ts`, `user-achievement.repository.ts` (`findProgressContextByUserId`), `ProfileAchievementsList.tsx`, i18n `criteriaProgress`
- What changed visually: locked achievement tiles show mono `current / target` (e.g. `7 / 10`, `0 / 1`); unlocked keep unlock date; section header `progressCount` unchanged
- Tokens/components added: none (reuse `font-mono` / `tabular-nums` / `text-muted`)
- Explicitly NOT changed: scoring, snapshot, award/toast core, catalog codes, Daily
- Verify: `/ru`+`/en` profile; light/dark; Vitest 93; commit `8f600fb`
- Follow-up: none for this slice — next product epic = Timed mode (Prompt A)

### 2026-07-30 — Toast reuse + scroll-preserving mutations

- Scope: Feature:Toast follow-up / Fix:scroll
- Skills used: gamemind-taste-ui
- Files touched: `AppToaster`, profile forms + `ProfileSettingsSection`, admin notice flash/bulk/single-row actions, users actions, `refresh-preserving-scroll`
- What changed visually: success toasts on profile/admin; bottom-center toast through `lg`; no jump-to-top on mid-list / open settings mutations
- Explicitly NOT changed: scoring/snapshot; inbox; RATE_LIMITED stays InlineAlert
- Verify: mid viewport toast; profile username with settings open; admin bulk + row deactivate
- Follow-up: none — toast surface closed

### 2026-07-30 — Toast reuse: profile + admin notices

- Scope: Feature:Toast follow-up / Prompt T-Feature
- Skills used: gamemind-taste-ui
- Files touched: profile Change*Form; admin `parse-admin-notice`, `AdminNoticeFlash`, questions actions/page; i18n `notifications.*`
- What changed visually: success feedback via toast (no success InlineAlert on profile); admin list flash after save/bulk
- Explicitly NOT changed: RATE_LIMITED still InlineAlert only; scoring/snapshot; inbox
- Verify: profile save toast; admin create + bulk deactivate/publish; Vitest 89
- Follow-up: none required for toast MVP surface

### 2026-07-30 — Toast Notifications MVP (Sonner + unlock flash)

- Scope: Feature:Toast / Prompt T-Feature
- Skills used: gamemind-taste-ui
- Files touched: `app-toaster.tsx`, `theme-client.ts`, `toast.ts`, `AchievementUnlockToast.tsx`, `AchievementUnlockFlash.tsx`, `globals.css`, result page, quiz submit, i18n `notifications.*` / `achievements.toast*`
- What changed visually:
  - global Scoreboard toasts (surface / border / primary left rule);
  - achievement cards with mark; top-right under sticky header;
  - live theme + live RU/EN while toast open; close on the right
- Tokens/components added: Sonner bus remapped to CSS vars; custom unlock cards
- Explicitly NOT changed: scoring math, snapshot hot path, inbox/bell
- Verify: light/dark + RU/EN while open; no text-over-icon; Vitest 83
- Follow-up: optional profile/admin `toastSuccess` — see DECISIONS Toast “How to add”

### 2026-07-30 — Profile stats summary: densify + full-width mid grid

- Scope: Fix:Profile stats / Prompt T-Feature polish
- Skills used: gamemind-taste-ui
- Files touched: `ProfileStatsSummary.tsx`, i18n `statsBestScore` (ru/en)
- What changed visually:
  - reverted mid-width list-rows regression; canon **2×2** until lg, **4-col** on lg+ (wider date `fr`);
  - all four values share `font-display` + tabular-nums (date not mono);
  - removed label `min-h` + tighter py/gap (no empty gap above numbers);
  - no `max-w-*` on mid — card spans full column (aligned with identity/achievements);
  - shorter labels: Рекорд / Record
- Tokens/components added: none
- Explicitly NOT changed: scoring, snapshot, achievements award, prisma, auth, profile IA
- Verify: 320 / ~640 / 768 / lg; light/dark; ru/en — user OK
- Follow-up: done — commit `9839fa1`

### 2026-07-30 — Profile illustration pack + layout polish v2

- Scope: Feature:Achievements + Profile / Prompt T-Feature
- Skills used: gamemind-taste-ui
- Files touched: `achievements/illustrations/*`, `AchievementMark.tsx`, `ProfileAchievementsList.tsx`, `profile/page.tsx`, `ProfileStatsSummary.tsx`, `ProfileResultHistory.tsx`
- What changed visually:
  - filled SVG plaque illustration pack (5 marks, currentColor, light/dark);
  - achievements as 2-col tile grid (sm+);
  - lg: sticky left column; history max-height + internal scroll (settings not buried);
  - tighter stats strip
- Explicitly NOT changed: award/scoring/schema; no PNG asset pipeline yet
- Verify: desktop long history scrolls in-pane; mobile tile stack; dark theme marks; locked opacity
- Follow-up: commit → prod migration

### 2026-07-30 — Profile compact achievements + layout IA

- Scope: Feature:Achievements + Profile / Prompt T-Feature
- Skills used: gamemind-taste-ui
- Files touched: `AchievementMark.tsx`, `ProfileAchievementsList.tsx`, `profile/page.tsx`, i18n `progressCount` / `sectionSettings`
- What changed visually:
  - achievements = compact bordered strip + unique SVG plaque marks (not emoji/Lucide);
  - header count `N / M`; description line-clamp-1;
  - profile identity strip (avatar + name + logout);
  - lg: 2-col mid (stats+achievements | history); settings in `<details>`
- Explicitly NOT changed: award/scoring/schema
- Verify: 320px + desktop; light/dark; ru/en; open/close settings; locked vs unlocked mark color
- Follow-up: commit → prod migration UserAchievement

### 2026-07-30 — Achievements on profile (locked / unlocked list)

- Scope: Feature:Achievements / Prompt T-Feature
- Skills used: gamemind-taste-ui
- Files touched: `ProfileAchievementsList.tsx`, `get-achievement-progress.ts`, `profile/page.tsx`, i18n `achievements.*`
- What changed visually:
  - profile section after stats: 5 MVP badges in catalog order;
  - unlocked = border-l-primary surface; locked = muted border-l-border + opacity;
  - mono meta: unlocked date or «locked»
- Explicitly NOT changed: scoring, snapshot, leaderboard, daily challenge logic
- Verify: light/dark; ru/en; mobile profile; catch-up awards old results on profile open
- Follow-up: commit → prod migration `UserAchievement` + smoke

### 2026-07-30 — Daily Challenge board (today’s ranking under CTA)

- Scope: Feature:DailyChallenge / Prompt T-Feature
- Skills used: gamemind-taste-ui
- Files touched: `daily-challenge-board.tsx`, `daily-challenge-cta.tsx` (+ embedded panel), repo `findScoresByChallengeId`, i18n `boardTitle`/`boardEmpty`
- What changed visually:
  - compact top-10 strip under daily CTA (podium 1–3, accuracy + score);
  - empty copy when day exists but no finishes yet;
  - board hidden until DailyChallenge row for today exists
- Explicitly NOT changed: global `/leaderboard`, scoring, snapshot, prod migration
- Verify: finish daily → appear on board; second user ranks; guest sees board if day exists; light/dark; ru/en
- Follow-up: commit → prod migration + smoke

### 2026-07-30 — Daily Challenge CTA (home + quiz setup)

- Scope: Feature:DailyChallenge / Prompt T-Feature
- Skills used: gamemind-taste-ui
- Files touched: `daily-challenge-cta.tsx`, `daily-challenge-cta-panel.tsx`, home `page.tsx`, quiz setup `page.tsx`, i18n `dailyChallenge.*`, QuizSetupForm spacing
- What changed visually:
  - Scoreboard surface panel: mono eyebrow, display title, border-l-primary meta;
  - states: login / start / continue / completed+score / pool unavailable;
  - home: **secondary** under brand CTA (brand GameMind stays hero);
  - quiz setup: Daily above classic; caps eyebrow «Обычный квиз»
- Tokens/components added: feature CTA (reuse SubmitButton / PendingLink / surface tokens)
- Explicitly NOT changed: scoring, snapshot math, submitQuiz, Prisma, daily board, prod migration
- Verify: guest home → login CTA; logged-in → start → quiz; second visit continue/result; light/dark; ru/en; mobile
- Follow-up: commit start+CTA slice; daily leaderboard later; prod migration when smoke OK

### 2026-07-29 — Leaderboard period filter (week / month / all-time)

- Scope: Feature:Leaderboard period / Prompt T-Feature
- Skills used: gamemind-taste-ui
- Files touched: `leaderboard-period-filters.tsx`, `leaderboard-difficulty-filters.tsx`, `leaderboard/page.tsx`, parse + repo, i18n `filterPeriod*`
- What changed visually:
  - second Scoreboard **segmented control** under title: Период — Всё время / Неделя / Месяц;
  - period sits **above** difficulty; shared border-b under difficulty group;
  - description copy no longer claims “only all-time”; `emptyFiltered` covers any active filters;
  - both filters keep each other’s URL params when switching
- Tokens/components added: none (reuse PendingLink + surface/primary tokens)
- Explicitly NOT changed: scoring, snapshot, Neon admin-list, calendar week/month, category boards
- Verify: localhost `/ru/leaderboard` — period chips; `?period=week&difficulty=HARD`; light/dark; ru/en; mobile row of 3 period chips
- Follow-up: commit → prod redeploy/smoke

### 2026-07-29 — Admin bulk toolbar: stuck pending fix

- Scope: Fix:Admin bulk toolbar pending / Feature polish
- Skills used: gamemind-taste-ui
- Files touched: `AdminQuestionsTable.tsx` (`BulkQuestionsToolbar`)
- What changed visually: после bulk mutate кнопки снова кликабельны (не серые навсегда); select/clear больше не блокируются pending
- Explicitly NOT changed: capabilities rules, Server Actions, Neon
- Verify: deactivate → статусы «Неактивен» → сразу доступны Activate + Снять выбор; DRAFT selection показывает группу Публикация
- Follow-up: continuity + commit when asked

### 2026-07-29 — Admin bulk toolbar: contextual actions + grouping

- Scope: Feature:Admin bulk publication UX polish / Prompt T-Feature
- Skills used: gamemind-taste-ui
- Files touched: `AdminQuestionsTable.tsx`, `bulk-toolbar-capabilities.ts` (+ test), i18n `bulkGroup*` / `bulkNoActionsForSelection`
- What changed visually:
  - toolbar split: **selection row** vs **mutation row**;
  - mutation CTA **hidden** unless applicable (PUBLISHED → no «Опубликовать»; active → no «Активировать»);
  - two scoreboard groups: `Витрина` / `Публикация` (uppercase mono eyebrow);
  - empty-applicable selection → muted hint, not a wall of dead links;
  - forms send only eligible ids
- Explicitly NOT changed: scoring, snapshot, Neon list SQL, quality gate rules, hard-delete bulk, return-to-draft bulk
- Verify: select 2× PUBLISHED+active at 320/768/desktop — only «Деактивировать»; DRAFT shows publication group; light/dark; ru/en
- Follow-up: continuity + commit when asked

### 2026-07-29 — Leaderboard difficulty filter (segmented control polish)

- Scope: Feature:Leaderboard difficulty filter / Prompt T-Feature
- Skills used: gamemind-taste-ui
- Files touched: `leaderboard-difficulty-filters.tsx`, `leaderboard-table.tsx` (spacing), i18n `leaderboard.filter*` / `emptyFiltered`
- What changed visually:
  - filter = **segmented control** (один ряд в `border` + `bg-surface`), не 2×2 CTA-сетка;
  - eyebrow `СЛОЖНОСТЬ` / `DIFFICULTY` (uppercase tracking как у thead);
  - `border-b` под фильтром; таблица ближе (`mt-4`);
  - active = primary; idle = muted (без отдельных «толстых» кнопок)
- Explicitly NOT changed: scoring, snapshot, `findBestScores` SQL semantics, admin list
- Verify: `/ru/leaderboard` + `?difficulty=HARD` at 320 / 375 / 768; light/dark; EN
- Follow-up: continuity + commit when asked

### 2026-07-29 — Profile stats: scoreboard layout + section order

- Scope: Feature:Profile stats / Prompt T-Feature polish (after screenshots)
- Skills used: gamemind-taste-ui
- Files touched: `ProfileStatsSummary.tsx`, `profile/page.tsx`, i18n `profile.stats*` (ru/en shorter labels)
- What changed visually:
  - stats panel: `border-l-4 border-l-primary` scoreboard strip (admin hub language);
  - grid **2×2 until lg**, then 4-col (320/768 no longer crush labels/date);
  - date = mono mid-size; values slightly smaller on phone; `min-w-0` cells;
  - page order: **Account → Summary → History → Avatar → Password** (progress above settings);
  - shorter scoreboard labels (Сыграно / Точность / Played / Accuracy)
- Explicitly NOT changed: scoring, snapshot, Neon SQL aggregates, auth, admin questions
- Verify: `/ru/profile` + `/en/profile` at 320 / 768 / desktop; light/dark; stats above password form
- Follow-up: continuity PROJECT_CONTEXT + commit when asked

### 2026-07-28 — Pending feedback: spinner on Server Action buttons

- Scope: Fix / Feature:perceived-performance (§11.9 light follow-up)
- Skills used: gamemind-taste-ui
- Files touched: `pending-spinner.tsx`, `submit-button.tsx`, admin questions/users tables + row more + publication controls, `ChangeAvatarForm`, pages passing `workingLabel`; follow-up fix `AdminRowMoreMenu.tsx` (portal + fixed)
- What changed visually:
  - pending = spinner + label (not opacity-only dim);
  - bulk isActive: toolbar locks select/opposite action while request in flight;
  - same pending pattern on publish/activate/delete (questions + users) and avatar clear;
  - «Ещё» menu: panel via `createPortal` + `position: fixed` so `overflow-x-auto` table no longer clips it into a broken one-item chip
- Tokens/components added: `PendingSpinner` (currentColor ring, motion-safe spin)
- Explicitly NOT changed: scoring, snapshot, Neon paths, auth, bulk SQL
- Verify: admin questions ⋯ menu full list (draft/activate/delete), activate/deactivate (+ bulk), users, edit publication, light/dark, ru/en
- Follow-up: optional upgrade `actions/checkout` Node warning (unrelated)

### 2026-07-28 — Admin questions bulk isActive toolbar

- Scope: Feature:Admin bulk / Prompt T-Feature (Scoreboard Editorial, minimal)
- Skills used: gamemind-taste-ui (tokens only; no redesign)
- Files touched: `AdminQuestionsTable.tsx` (Client), i18n `admin.bulk*`
- What changed visually:
  - list: toolbar (count + select all/clear + bulk deactivate/activate text links);
  - checkboxes on cards (`<lg`) and table column (`lg+`, header select-all + indeterminate);
  - warning/success tones for bulk actions; `accent-primary` checkboxes.
- Explicitly NOT changed: publication/delete bulk; scoring/snapshot; admin list Neon SQL; Taste tokens/fonts
- Verify: multi-select deactivate/activate; single-row actions still work; light/dark; ru/en
- Follow-up: prod redeploy when ready; no further Taste work required for this slice

### 2026-07-27 — Publish quality panel + controlled admin form

- Scope: Feature:Admin QoL / Prompt T-Feature (Scoreboard Editorial)
- Skills used: gamemind-taste-ui
- Files touched: `AdminQuestionPublishQualityPanel.tsx`, edit `page.tsx`, `AdminQuestionForm.tsx`, `question-publish-quality.ts`, i18n `publishQuality.*`
- What changed visually:
  - edit: surface panel **Проверка перед публикацией** above publication CTAs (danger blockers / warning soft);
  - InlineAlert tones only; caps titles; empty issues → no panel;
  - form: controlled fields so failed create/update keeps typed values (React 19 form reset fix).
- Explicitly NOT changed: scoring, snapshot, auth, admin list Neon SQL; Taste tokens unchanged
- Verify: duplicate options → Publish blocked + panel; light/dark; ru/en
- Follow-up: commit; optional Vitest for pure quality fn; bulk actions

### 2026-07-27 — Admin questions row actions density (Edit + more menu)

- Scope: Feature:Admin QoL / Prompt T-Feature (Scoreboard Editorial)
- Skills used: gamemind-taste-ui + design-taste-frontend
- Files touched: `AdminQuestionsTable.tsx`, `AdminRowMoreMenu.tsx`, `AdminQuestionRowMoreActions.tsx`, `question-admin.repository.ts` (list cache patch), `actions/questions.ts`, i18n `rowMoreActions` + submit label
- What changed visually:
  - desktop queue: **Редактировать** + **⋯** only (stable Actions column);
  - publication / activate / deactivate / delete inside native `<details>` menu (no dropdown library);
  - list pipeline CTAs exclusive: DRAFT → «Отправить на ревью»; IN_REVIEW → «Опубликовать» (+ В черновик); Activate ↔ Deactivate XOR;
  - mobile cards unchanged (all text actions visible).
- Perf (not visual, same PR): patch one row in admin list TTL cache after publication/isActive mutate (avoid full invalidate → 3×SELECT); revalidate edit path only when `returnTo=edit`.
- Explicitly NOT changed: scoring, snapshot, auth, quiz hot path, Neon list SQL playbook (no JOIN/$1)
- Verify: DRAFT→review→publish in menu; light/dark; ru/en; filtered publication still safe
- Follow-up: prod migration + deploy; then §11.7 quiz-session split

### 2026-07-26 late — Admin draft workflow remainder (edit + publication filter)

- Scope: Feature:Admin draft workflow
- Skills used: gamemind-taste-ui + design-taste-frontend (Scoreboard Editorial)
- Files touched: `parse-admin-question-list-filters.ts`, `question-admin.repository.ts`, `AdminQuestionsFilters.tsx`, `actions/questions.ts`, `AdminQuestionPublicationControls.tsx`, edit `page.tsx`
- What changed visually:
  - filters: fourth select **Публикация** (DRAFT / IN_REVIEW / PUBLISHED / any);
  - edit page: publication panel above form (badge + isActive chip + allowed transition CTAs);
  - Scoreboard tokens only (surface, muted/warning/success badge, primary/secondary buttons).
- Important technical/UI boundary:
  - publication filter without difficulty uses 3×difficulty chunks (avoid hang);
  - `returnTo=edit` keeps admin on edit after workflow actions;
  - content save still does not change publicationStatus.
- Explicitly NOT changed: scoring, snapshot, auth, quiz hot path, Prisma schema
- Verify: `/ru|/en/admin/questions` publication filter + Reset; edit DRAFT→publish/review→draft; light/dark
- Follow-up: commit + prod migration; later primary row action + “more” menu

### 2026-07-26 — Admin questions draft workflow list + content queue repair

- Scope: Feature:Admin draft workflow / Fix:admin list UX
- Skills used: gamemind-taste-ui + design-taste-frontend (Scoreboard Editorial)
- Files touched: `AdminQuestionsTable.tsx`, admin actions/i18n, `question-admin.repository.ts`
- What changed visually:
  - publicationStatus badge + allowed workflow actions in list;
  - desktop list switched from overloaded spreadsheet to **content queue row**: question + meta, lifecycle, date, actions;
  - IMAGE_GUESS desktop preview enlarged (`h-16 w-28`, `object-contain`) so screenshots are readable without turning list into a gallery;
  - removed misleading `Options: 0` from visible meta until safe count path is restored.
- Important technical/UI boundary:
  - EN question text in list uses main SELECT scalar subquery (`QuestionTranslation(en)` → `Question.text`), not a second queued read;
  - failed overlay read caused Neon hangs / broken filters — do not reintroduce it.
- Explicitly NOT changed: scoring, snapshot, auth guards, quiz hot path, Prisma schema after prior migration
- Verify: `/ru/admin/questions` + `/en/admin/questions`, filters, language switch, 1024/1280 desktop, mobile cards, light/dark
- Follow-up: edit-page workflow controls + publicationStatus filter; later primary row action + “more” menu for action density

### 2026-07-26 — Leaderboard scoreboard redesign + podium medals

- Scope: Feature:Leaderboard / Prompt T-Feature (Scoreboard Editorial)
- Skills used: gamemind-taste-ui + redesign-existing-projects + design-taste-frontend
- Files touched: `leaderboard-table.tsx`, `leaderboard/page.tsx`, `globals.css` (podium tokens)
- What changed visually:
  - **&lt;sm:** dense sports strip — rank | name+accuracy·date | score right; `max-w-md` (no center void)
  - **sm+:** full-width table + filler column (data grouped left, row lines full width; no `w-max` island, no justify-between hole)
  - Score = display/semibold hierarchy; accuracy = success; page shell `max-w-3xl`
  - Top-3: compact metal plaques (`RankMark` via `var(--podium-gold|silver|bronze)`); rank 4+ muted mono; no emoji crowns
- Tokens added: `--podium-gold/silver/bronze` + `-fg` (light + dark)
- Explicitly NOT changed: scoring, findBestScores, snapshot, prisma, auth, i18n keys (labels already score/accuracy/date)
- Verify: 320 / 375 / 480 / 640 / 768 / 1024 / 1280; light/dark; ru/en; medals visible after hard refresh
- Follow-up: commit when ready; draft workflow or §11.7 next

### 2026-07-25 — Admin users list: responsive cards + actions UX

- Scope: Ongoing / Admin users presentation (after user-detail link)
- Skills used: gamemind-taste-ui
- Files touched: `AdminUsersTable.tsx`, `admin/users/page.tsx`
- What changed visually: &lt;lg = scoreboard surface cards (username link, role chip, status, meta, actions below border); lg+ = table with sticky actions column + **vertical** action stack (no crushed 4-link row); Created only from xl; page shell full-width CTAs on narrow; max-w-6xl
- Semantic colors kept: Карточка=info, role=primary, deactivate=warning, activate=success, delete=danger; touch min-h-10
- Explicitly NOT changed: prisma, user mutations/guards, ConfirmForm, scoring, snapshot
- Verify: 320 / 536 / 762 / 890 / desktop; light/dark; ru/en; self row = only Карточка
- Follow-up: smoke user detail from card username + View link

### 2026-07-25 — Admin users list: actions UX polish (pass 2)

- Scope: Ongoing / Admin users presentation (senior review after screenshots)
- Skills used: gamemind-taste-ui
- Files: `AdminUsersTable.tsx`, `admin/users/page.tsx`, i18n `userActionsManage`
- What changed visually: cards — single-column meta (no empty middle); **Карточка** = full-width secondary CTA; mutations = 2-col grid + min-h-11; table — **Карточка + details «Управление»** (compact row, inline expand, no overflow clip); both page CTAs = secondary
- Explicitly NOT changed: mutations/guards, ConfirmForm, scoring
- Verify: 320 / 510 / 794 / 1138; open/close Управление; self = only Карточка; light/dark
- Follow-up: commit with user-detail slice when ready

### 2026-07-25 — Admin users list: align with questions pattern (pass 3)

- Scope: Ongoing / Admin users — revert over-design from pass 2
- Why: full-width CTA + 2-col grid (3 items) + inline `<details>` made mobile taller and desktop rows balloon when open
- Files: `AdminUsersTable.tsx`, `admin/users/page.tsx`
- What changed visually: **same pattern as AdminQuestionsTable** — dense cards; wrap text-actions; table sticky + **nowrap** horizontal actions; username = primary detail link; page CTAs side-by-side on narrow (secondary + ghost)
- Dropped: full-width «Карточка» button, CSS grid actions, `<details> Управление` (и ключ i18n)
- Verify: 320 / 530 / 742 / desktop closed actions; compare visually to `/admin/questions`
- Follow-up: commit with user-detail slice

### 2026-07-25 — Admin user detail history = ProfileResultHistory pattern

- Scope: Ongoing / Admin user detail presentation
- Files: `AdminUserResultHistory.tsx` (new), `admin/users/[id]/page.tsx`
- What changed visually: recent results match profile — phone scoreboard stack (date + difficulty chip + ОЧКИ/ВЕРНО); sm+ table with chips, display scores, success «Верно»; no «Обзор» (result owner-only)
- Explicitly NOT changed: scoring, snapshot, result page guards
- Verify: `/admin/users/[id]` 320 vs `/profile`; desktop table; empty + load error
- Follow-up: commit with admin user detail slice

### 2026-07-24 — Profile history: info token + green de-noise

- Scope: Feature:Profile / Prompt T-Feature
- Skills used: gamemind-taste-ui (Scoreboard Editorial extend)
- Files: `globals.css` (`--info` / `--info-muted`), `ProfileResultHistory.tsx`, `docs/TASTE_SKILL.md` §4.3 + §7
- What changed visually: color roles in history — **Верно** = success only; **Обзор** = `text-info` (cool blue); **EASY** chip = foreground on `surface-muted` (no green); MEDIUM/HARD unchanged warning/danger
- Why: Легко + Верно + Обзор were three near-greens; scan noise
- Explicitly NOT changed: layout, breakpoints, scoring, snapshot, i18n, admin chips
- Verify: `/profile` light/dark + 320/desktop — green only on «Верно»; «Обзор» blue; «Легко» neutral plaque
- Follow-up: done for this chat — commit code below; optional reuse `text-info` for other secondary links later

### 2026-07-24 — Profile history hierarchy + difficulty chips

- Scope: Feature:Profile / Prompt T-Feature
- Skills used: gamemind-taste-ui + redesign-existing-projects (Scoreboard Editorial extend)
- Files: `ProfileResultHistory.tsx`, `docs/TASTE_SKILL.md`
- What changed visually: difficulty chip (`bg-surface-muted` + semantic text — muted fills were too weak on light); phone meta = muted mono date + chip + «Обзор»; scoreboard labels uppercase tracking; metrics `text-2xl`; stack until `sm` (640px); table thead `bg-surface-muted/60` + score/correct hierarchy
- Tokens/components added: local `DifficultyChip` (profile; not shared yet — admin still shows enum codes)
- Explicitly NOT changed: prisma, scoring, snapshot, history query, i18n keys
- Verify: `/profile` at 320 / 566 / 800+; light/dark; ru/en — chip must read as plaque, not plain colored text
- Follow-up: optional shared DifficultyChip later; smoke after next deploy

### 2026-07-25 — Admin home counts + hub Scoreboard polish

- Scope: Feature:Admin QoL / Prompt T-Feature
- Skills used: gamemind-taste-ui (Scoreboard Editorial extend)
- Files: `entities/admin/admin-home.repository.ts`, `app/[locale]/admin/page.tsx`, admin `homeStat*` / `homeCountsUnavailable` i18n
- What changed visually: sessions strip (mono + primary left border/number); denser nav cards; caps labels + large mono stats; Users single number (no label duplicate); primary hover/chevron affordance; dashed fallback if counts fail
- Explicitly NOT changed: prisma schema, quiz snapshot/scoring, admin list hang playbook, draft workflow
- Verify: `/ru/admin` + `/en/admin`, light/dark, mobile+desktop; cards navigate; counts match bank
- Follow-up: commit/redeploy when ready; draft workflow or §11.7 next

### 2026-07-23 — Admin questions filters + responsive list

- Scope: Feature:Admin QoL / Prompt T-Feature
- Skills used: gamemind-taste-ui (Scoreboard Editorial extend)
- Files: `parse-admin-question-list-filters.ts`, `AdminQuestionsFilters.tsx`, `AdminQuestionsTable.tsx`, `admin/questions/page.tsx`, `question.repository.ts` (list SELECT), `map-admin-questions.ts`, i18n admin filter keys, `language-switcher.tsx` (keep query)
- What changed visually: filter bar (3 equal selects + full-width search); list `<lg` = separate cards (IMAGE full-width hero `object-contain` + max-height; TEXT dense); `lg+` table with difficulty chip + compact thumb + sticky actions; page `max-w-6xl`
- Explicitly NOT changed: scoring, snapshot, quiz hot path, draft/published workflow, bulk actions
- Verify: filters auto-apply; locale switch keeps query; 320/600/desktop IMAGE + TEXT; Neon hang ≠ filter SQL (restart `npm run dev` if needed)
- Follow-up: redeploy when ready; draft workflow or admin home counts next

### 2026-07-22 — Wave B redeploy + prod smoke

- Scope: Wave B close-out / deploy
- Skills used: n/a (ops)
- Files touched: none (code already on `master` @ `39a7670`; Vercel Production Ready)
- What changed visually: Scoreboard Editorial Wave B live on `www.game-mind.ru` (Profile, Admin, a11y, history mobile)
- Explicitly NOT changed: scoring, snapshot, auth, prisma
- Verify: user smoke OK — home / quiz / result / leaderboard / profile (mobile history) / admin questions+users; active nav; header no unique-key; light/dark + ru/en; IMAGE_GUESS + scoring + auth OK
- Follow-up: Status = `ongoing`; next product epic (R2 / admin QoL / §11.7) or Prompt T-Feature for new UI

### 2026-07-22 — Profile history phone padding + correct emphasis

- Files: `ProfileResultHistory.tsx`
- What: phone rows `px-3`; metrics again as labeled scoreboard (Очки / Верно); **Верно** = `text-xl font-display text-success` + «N из M»
- Follow-up: redeploy

### 2026-07-22 — Profile history readability pass

- Scope: Wave B / Profile UX + i18n
- Files: `ProfileResultHistory.tsx`, `dictionary.ts`, `ru.ts`, `en.ts`
- What changed: phone (&lt;480) dense row — «Очки N · Верно N из M» (no 3-col stretch); table from **480px** (622 → table); `historyOf` = из/of
- Terminal note: «1 issue» = hydration `bis_skin_checked` (browser extension), not unique-key
- Follow-up: Wave B redeploy + smoke

### 2026-07-22 — Profile history: phone strip + table from sm

- Scope: Wave B / Profile UX
- Files: `ProfileResultHistory.tsx`
- What changed: phone (&lt;640) = meta + 3-col strip (Очки | Верно | Обзор) fills width; **sm+ = table** (no justify-between void on 600–700px)
- Explicitly NOT changed: prisma, auth, scoring
- Verify: 320 (strip), 676 (table), desktop; light/dark
- Follow-up: Wave B redeploy + smoke

### 2026-07-22 — Profile history compact rows + AppSiteHeader key fix

- Scope: Wave B / Profile UX + Fix nav RSC slots
- Files touched: `ProfileResultHistory.tsx`, `AppSiteHeader.tsx` (new), `[locale]/layout.tsx`, `site-header.tsx`
- What changed visually: mobile history = dense activity row (meta + inline labeled stats + Review); no giant orphan digits / empty middle; md+ table
- What changed technically: layout passes serializable props to client `AppSiteHeader`, which creates auth slots locally — fixes unique-key warning from RSC→Client JSX props
- Explicitly NOT changed: prisma, auth logic, scoring, i18n keys
- Verify: 320/375/768; Console без unique-key; Incognito for `bis_skin_checked`; light/dark ru/en
- Follow-up: Wave B redeploy + smoke → Status = ongoing

### 2026-07-21 — Profile history mobile labeled stats

- Scope: Wave B / Profile UX polish
- Files touched: `ProfileResultHistory.tsx`
- What changed visually: mobile/tablet (&lt;md) rows = date·difficulty + Review; full-width 2-col `dl` with visible labels Очки/Верно; whole row tappable; md+ table unchanged
- Explicitly NOT changed: prisma, auth, i18n keys, scoring
- Verify: 375/429/768; labels readable; no orphan score digits; light/dark
- Follow-up: Wave B redeploy + smoke

### 2026-07-21 — Profile history mobile list + header key fix

- Scope: Wave B / Profile UX + Fix nav chrome
- Skills used: gamemind-taste-ui
- Files touched: `ProfileResultHistory.tsx`, `site-header.tsx`, `site-mobile-menu.tsx`
- What changed visually: mobile history = compact scoreboard rows (date + difficulty·correct | score + Review) without horizontal scroll; `sm+` keeps table; header no longer reuses the same RSC slot element twice
- Tokens/components added: none
- Explicitly NOT changed: prisma, auth logic, history query, i18n keys, scoring
- Verify: 333/390 — no H-scroll, all fields readable; desktop table intact; Console без unique-key warning; `bis_skin_checked` hydration = browser extension (Incognito)
- Follow-up: Wave B redeploy + smoke → Status = ongoing

### 2026-07-21 — Profile history mobile overflow

- Scope: Wave B / Profile polish (before redeploy)
- Skills used: gamemind-taste-ui
- Files touched: `ProfileResultHistory.tsx`
- What changed visually: history table keeps Scoreboard Editorial layout; on ~320–390px horizontal scroll instead of clipped/squashed columns; bleed `-mx-4 px-4` to `main` edge on mobile; `min-w-xl` (36rem) + `whitespace-nowrap` on cells
- Note: superseded same night by mobile scoreboard list (see entry above)
- Tokens/components added: none (existing tokens)
- Explicitly NOT changed: prisma, auth, history query, i18n keys, card redesign, scoring
- Verify: DevTools 333×470 + 390×844; scroll to «Открыть»; light/dark; ru/en; desktop ≥640 no bad bleed
- Follow-up: Wave B redeploy + smoke → Status = ongoing

### 2026-07-21 — Fix header RSC slot key warning

- Scope: Fix / nav chrome
- Files: `HeaderAuthControls.tsx`, `site-header.tsx`
- What changed: single-root wrappers instead of Fragments for auth/utilities slots (RSC→Client key warning)
- Explicitly NOT changed: auth logic, active-nav match rules
- Note: DevTools hydration `bis_skin_checked` = browser extension — ignore / test in Incognito
- Follow-up: ~~Profile history mobile overflow~~ done → redeploy

### 2026-07-21 — Wave B a11y: active nav highlight

- Scope: Wave B / a11y pass (active nav desktop + mobile)
- Skills used: gamemind-taste-ui
- Files touched: `nav-active.ts` (new), `site-header.tsx`, `site-mobile-menu.tsx`, `HeaderAuthControls.tsx`
- What changed visually: current nav item uses `bg-surface-muted` + `font-medium` + `text-foreground`; `aria-current="page"` on active links (main nav, login/register, profile avatar)
- Match rules: home `/` exact; `/admin` + `/admin/*`; other hrefs exact or nested; locale stripped via `removeLocaleFromPathname`
- Tokens/components added: `isNavActive` / `navActiveClassName` helper (Scoreboard tokens only)
- Explicitly NOT changed: prisma, auth, scoring, snapshot, admin write actions, routing contracts
- Verify: light/dark, ru/en, mobile ☰; DevTools `aria-current` on current item; Tab focus rings; `/admin/questions` keeps Admin active
- Follow-up: ~~Profile history mobile overflow~~ done → Wave B redeploy + smoke

### 2026-07-21 — Wave B Admin users polish

- Scope: Wave B / Admin users list + admin hub token pass
- Skills used: gamemind-taste-ui, redesign-existing-projects
- Files touched: `AdminUsersTable.tsx`, `admin/users/page.tsx`, `admin/page.tsx`
- What changed visually: dense scoreboard users table (surface border, muted thead, mono tabular cells); row actions `primary` / `warning` / `success` / `danger` + focus rings (no blue/amber/green/neutral drift); self-row muted em dash; list page `font-display` + shared `buttonClassName` CTAs; hub `text-muted` / denser padding
- Tokens/components added: none (reused Button/`buttonClassName`, EmptyState, InlineAlert, ConfirmForm)
- Explicitly NOT changed: prisma, admin users write actions (role / isActive / delete / last-admin / self guards), ConfirmForm `window.confirm`, scoring, snapshot, auth
- Verify: light/dark, ru/en, mobile table scroll; self-row «—»; role/activate/delete confirms; keyboard focus on row actions
- Follow-up: ~~Wave B a11y~~ — done same night

### 2026-07-21 — Wave B Admin questions polish

- Scope: Wave B / Admin questions list + create/edit forms
- Skills used: gamemind-taste-ui, redesign-existing-projects
- Files touched: `AdminQuestionsTable.tsx`, `admin/questions/page.tsx`, `AdminQuestionForm.tsx`, `admin/questions/new/page.tsx`, `admin/questions/[id]/edit/page.tsx`
- What changed visually: dense scoreboard table (surface border, muted thead, mono tabular cells); row actions use semantic `primary` / `warning` / `success` / `danger` + focus rings (no blue/amber/green/neutral one-offs); list page `font-display` + shared `buttonClassName` CTAs; form fields match Profile focus/tokens; create/edit shells with back to questions list
- Tokens/components added: none (reused Button/`buttonClassName`, EmptyState, InlineAlert)
- Explicitly NOT changed: prisma, admin write actions logic, scoring, snapshot, auth
- Verify: light/dark, ru/en, mobile table scroll; keyboard focus on row actions + form fields; activate/deactivate/delete still work
- Follow-up: **Wave B Admin users** (done same night)

### 2026-07-21 — PendingLink: remove pulse dot (layout shift)

- Scope: Fix / Wave B interaction
- Skills used: n/a
- Files touched: `src/shared/ui/pending-link.tsx`
- What changed visually: removed inline pending pulse dot that shifted header/nav width on click; pending feedback remains as opacity only
- Explicitly NOT changed: routing, auth, scoring
- Verify: click nav links — no white/teal dot, no horizontal jump
- Follow-up: active nav highlight deferred → §5 Wave B a11y + backlog checkbox

### 2026-07-21 — Wave B Profile + global cursor-pointer

- Scope: Wave B / Profile + interaction affordance
- Skills used: gamemind-taste-ui, redesign-existing-projects
- Files touched: `profile/page.tsx`, `ProfileResultHistory.tsx`, `ChangeUsernameForm.tsx`, `ChangeAvatarForm.tsx`, `ChangePasswordForm.tsx`, `dictionary.ts` / `ru.ts` / `en.ts` (`sectionAccount`, `sectionSecurity`), `globals.css` (`@layer base` cursor), `button.tsx`, `pending-link.tsx`, `submit-button.tsx`
- What changed visually: Profile section hierarchy Account → Avatar → Security → History; Scoreboard tokens (no `neutral-*`); EmptyState for empty history; form headings demoted under page sections; clear avatar uses shared `Button`; global `cursor: pointer` on links/enabled buttons/file inputs
- Tokens/components added: i18n section keys; no new primitives
- Explicitly NOT changed: auth actions, prisma, scoring, snapshot, avatar R2 (interim URL remains)
- Verify: light/dark, ru/en, mobile profile; hover cursor on CTAs/nav/links; disabled still not-allowed / pending wait via components
- Follow-up: **Wave B Admin questions** (new chat)

### 2026-07-21 — Wave A redeploy + prod smoke

- Scope: Wave A close-out / deploy
- Skills used: n/a (ops)
- Files touched: none in this note (prior Task 9 + Wave A already on branch)
- What changed visually: Scoreboard Editorial Wave A live on `www.game-mind.ru`
- Explicitly NOT changed: scoring, snapshot, auth, prisma
- Verify: user — redeploy + smoke OK (home → quiz → result → leaderboard; a11y/themes/locales as before)
- Follow-up: **Wave B Profile** polish (new chat)

### 2026-07-21 — Task 9: A11y + visual smoke

- Scope: Wave A / a11y quality bar
- Skills used: gamemind-taste-ui
- Files touched: `dictionary.ts`, `ru.ts`, `en.ts`, `[locale]/layout.tsx`, `site-header.tsx`, `site-mobile-menu.tsx`, `globals.css`
- What changed: skip-to-content link; i18n `mainNav` / `skipToContent`; desktop+mobile nav landmarks; mobile menu focus restore on Escape/scrim/close; stronger `prefers-reduced-motion` (kills infinite pulse)
- Tokens/components added: i18n keys only
- Explicitly NOT changed: scoring, snapshot, quiz actions, entities, prisma, auth logic
- Verify: user OK — keyboard, light/dark, ru/en, IMAGE_GUESS, reduced-motion, axe smoke
- Follow-up: Wave A redeploy + smoke on `www.game-mind.ru`; then Wave B Profile (new chat)

### 2026-07-21 — Mobile menu polish (header keep + no layout shift + hamburger clip)

- Scope: Fix / nav
- Files: `site-mobile-menu.tsx`, `site-header.tsx`, `globals.css`
- What changed: header stays above scrim; scrollbar-gap compensation; menu panel fixed full-bleed; `--site-header-sticky-offset` raised so panel does not clip hamburger; compact icon
- Note: console `bis_skin_checked` hydration = browser extension, not app bug
- Follow-up: Task 9 A11y smoke

### 2026-07-21 — Task 8: Loading / error / empty / disabled system

- Scope: Wave A / shared feedback primitives
- Files: `inline-alert.tsx`, `empty-state.tsx`, `skeleton.tsx` (semantic tokens), wired into auth/quiz/profile/admin/leaderboard
- Also: mobile menu dismiss via backdrop + Escape + body scroll lock (amended into nav fix commit)
- Explicitly NOT changed: scoring, actions logic
- Verify: login error banner; empty leaderboard; quiz disabled submit still explained; skeletons use surface-muted
- Follow-up: **Task 9** — A11y + visual smoke

### 2026-07-21 — Fix header Admin/avatar collision + mobile menu chrome

- Scope: Fix / nav
- Files: `site-header.tsx`, `site-mobile-menu.tsx`, `HeaderAuthControls.tsx`, `globals.css`
- What changed: hamburger until `lg` (1024); desktop auth separated with `border-l` + gap; menu auth = username text + logout only (no duplicate avatar under Админ)
- Verify: 526 / 797 / 1280 widths; open ☰ — no avatar under Admin link
- Follow-up: Task 8

### 2026-07-21 — Fix mobile header chrome (hamburger + compact utilities)

- Scope: Fix / Wave A mobile nav
- Skills used: gamemind-taste-ui
- Files touched: `site-header.tsx`, `site-mobile-menu.tsx`, `language-switcher.tsx`, `theme-toggle.tsx`, `HeaderAuthControls.tsx`, locale `layout.tsx`, i18n `openMenu`/`closeMenu`
- What changed visually: mobile bar = brand + avatar + ☰; links/lang/theme/logout in slide-down panel; desktop unchanged full nav
- Note on hydration: `bis_skin_checked` mismatch is a **browser extension** (not app bug) — ignore or test in Incognito
- Explicitly NOT changed: quiz logic, scoring
- Verify: 390px and ~320px — header not cramped; menu opens; sticky progress still under header
- Follow-up: Task 8

### 2026-07-21 — Task 7: Mobile pass quiz flow (~390px)

- Scope: Wave A / setup + session + result mobile comfort
- Skills used: gamemind-taste-ui
- Files touched: `globals.css` (`--site-header-sticky-offset`), `site-header.tsx`, setup/session/result pages, `QuizSetupForm`, `QuizSessionForm`, `QuestionCard`, `QuestionImage`, `QuizResultSummary`, `QuizResultReview`
- What changed visually: single-row scrollable nav (stable sticky height); progress uses CSS var offset; denser mobile padding; larger option tap targets; IMAGE_GUESS slightly lower max-h on mobile (still no crop); result score/CTAs/filters tuned for narrow width
- Tokens/components added: `--site-header-sticky-offset`
- Explicitly NOT changed: scoring, snapshot, actions, auth
- Verify: DevTools 390×844 — setup/session/result; sticky nav+progress+submit; options tappable; IMAGE_GUESS full frame
- Follow-up: **Task 8** — Loading / error / empty / disabled

### 2026-07-21 — Task 6: Result summary hierarchy

- Scope: Wave A / result page presentation
- Skills used: gamemind-taste-ui
- Files touched: `QuizResultSummary.tsx` (new), `result/[sessionId]/page.tsx`, light polish on `QuizResultReview` heading
- What changed visually: scoreboard card with `font-display` title + large tabular score + correct/total; primary/secondary/ghost CTAs full-width on mobile; review section separated by hairline
- Tokens/components added: `QuizResultSummary` presentational wrapper
- Explicitly NOT changed: scoring math, repositories, review filter logic, numeric values
- Verify: score text identical to before; light/dark; ru/en CTAs; mobile CTA stack
- Follow-up: **Task 7** — Mobile pass quiz flow

### 2026-07-21 — Quiz sticky chrome (nav + progress + submit dock)

- Scope: Wave A / quiz session UX (P1-1 + sticky footer fix)
- Skills used: gamemind-taste-ui
- Files touched: `site-header.tsx`, `QuizSessionForm.tsx`, quiz i18n (`progressAnsweredLabel`)
- What changed visually: SiteHeader sticky + solid `bg-surface`; session progress sticky under nav with answered/total; submit dock full-bleed opaque + `z-30` + larger content `pb-*` so IMAGE_GUESS no longer paints over the button
- Tokens/components added: i18n `quiz.progressAnsweredLabel`
- Explicitly NOT changed: scoring, snapshot, `allAnswered` rule, QuestionCard/Image framing
- Verify: scroll mid-session — nav + progress stay; bottom dock covers full column; light/dark; ru/en
- Follow-up: Task 6 result hierarchy; optional refine `top-14` if nav wraps to two rows on very narrow screens

### 2026-07-21 — Task 5: Question screen polish

- Scope: Wave A / quiz session presentation
- Skills used: gamemind-taste-ui
- Files touched: `quiz/[sessionId]/page.tsx`, `QuestionCard.tsx`, `QuestionImage.tsx`
- What changed visually: session title uses `font-display` + hairline rule; question card border + clearer block order (title → image → options); relaxed/`text-pretty` leading; IMAGE_GUESS frame solid border, more padding, slightly lower mobile max-h, still native ratio + `object-contain` (no crop)
- Tokens/components added: none
- Explicitly NOT changed: scoring, snapshot, actions, option select logic, image loader behavior
- Verify: TEXT + IMAGE_GUESS light/dark; long RU titles wrap; image not cropped; options still clear from Task 3
- Follow-up: **Task 6** — Result summary hierarchy

### 2026-07-21 — Task 4: Progress + sticky submit UX

- Scope: Wave A / quiz session presentation
- Skills used: gamemind-taste-ui
- Files touched: `src/features/quiz/components/QuizSessionForm.tsx`
- What changed visually: progress block on surface + clearer bar; sticky submit uses solid `bg-background` (no glass blur); disabled submit shows helper from `quiz.errors.answerAll` + `aria-describedby`
- Tokens/components added: none (reused existing i18n key)
- Explicitly NOT changed: `allAnswered` rule, scoring, snapshot, actions, QuestionCard
- Verify: helper when incomplete; disappears when all answered; light/dark; sticky readable over content
- Follow-up: **Task 5** — Question screen polish

### 2026-07-21 — Task 3: Answer options clarity

- Scope: Wave A / quiz session presentation
- Skills used: gamemind-taste-ui
- Files touched: `src/features/quiz/components/QuestionCard.tsx`
- What changed visually: selected option uses `border-2 border-primary` + `bg-primary/10` + larger radio indicator + `font-semibold`; unselected keeps muted fill with transparent border (no layout jump)
- Tokens/components added: none (existing semantic tokens)
- Explicitly NOT changed: scoring, snapshot, quiz actions, QuestionImage framing, i18n
- Verify: light/dark selected state, keyboard focus-within, mobile tap targets, IMAGE_GUESS unchanged
- Follow-up: **Task 4** — Progress + sticky submit UX

### 2026-07-21 — UI/UX strategy + senior audit canonized

- Scope: Docs / foundation Wave 0 (no app UI code)
- Skills used: gamemind-taste-ui + redesign/design-taste framing (audit only)
- Files touched: `docs/TASTE_SKILL.md`, `docs/DECISIONS.md`, `docs/PROJECT_CONTEXT.md`, `docs/ROADMAP.md`, `AGENTS.md` (Prompt T-Task)
- What changed visually: none in app — direction **Scoreboard Editorial** chosen; audit in §6; strategy §13; backlog §14
- Tokens/components added: none in code yet
- Explicitly NOT changed: db, scoring, snapshot, auth, quiz components
- Verify: n/a (docs)
- Follow-up: **Task 1** — design tokens + typography (`Prompt T-Task`)

### 2026-07-18 — §11.9 light perceived performance

- Scope: Interaction UX (not Taste waves)
- Skills used: none for brand; shared UI primitives only
- Files: `shared/ui` skeleton/submit/pending-link; route `loading.tsx`; auth/quiz/profile/admin pending; `common.*` i18n
- What changed visually: pulse skeletons on nav wait; disabled/busy submits; nav link pulse cue
- Explicitly NOT changed: design lock, fonts, palette, quiz IMAGE_GUESS framing
- Follow-up: Taste T-Audit tomorrow; restyle skeletons in Wave A/B

### 2026-07-18 — Taste skills installed

- Scope: Tooling setup (not Wave A/B UI yet)
- Skills used: install only
- Installed: `redesign-existing-projects`, `design-taste-frontend` → `.agents/skills/` (+ `skills-lock.json`)
- Note: `npx skills` needs Node ≥22.20 (used nvm `22.20.0`; default shell may still be Node 20)
- Explicitly NOT changed: design lock, fonts, palette, app screens
- Follow-up: Prompt T-Audit → lock §4 → Wave A; or light §11.9 first

### 2026-07-18 — Epic 4+5 on prod + §11.9 slotted

- Scope: Deploy confirmation + docs; light admin UX (hub) earlier same day
- Skills used: none (foundation still planned)
- Files touched: admin hub, continuity docs; Vercel prod deploy
- What changed visually: admin hub (Questions / Users); no Taste wave yet
- Tokens/components added: none for brand lock
- Explicitly NOT changed: design system lock, fonts, palette, quiz IMAGE_GUESS
- Related plan: **§11.9** in ROADMAP / PROJECT_CONTEXT Epic 8
- Verify: user confirmed Epic 4+5 work on `www.game-mind.ru`
- Follow-up: §11.9 light items and/or §11.8 foundation (unblocked)

### 2026-07-17 — Continuity bootstrap

- Scope: Docs only
- Created this file; slotted §11.8; continuous operating model
- Skills not installed yet
- No UI code changes

---

## 8. Install & Cursor wiring

### 8.1 Install Taste skills (when starting §11.8, or earlier if you want dials ready)

**Done July 18, 2026** — both core skills live under `.agents/skills/` (lockfile: `skills-lock.json`).

Requires **Node ≥ 22.20** for `npx skills` (Windows: `nvm use 22.20.0` if default is still Node 20).

```bash
# already installed — re-run only to update
npx skills add https://github.com/Leonxlnx/taste-skill --skill "redesign-existing-projects"
npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"
```

Optional after direction chosen:

```bash
npx skills add https://github.com/Leonxlnx/taste-skill --skill "high-end-visual-design"
# XOR
npx skills add https://github.com/Leonxlnx/taste-skill --skill "minimalist-ui"
```

Optional comps:

```bash
npx skills add https://github.com/Leonxlnx/taste-skill --skill "imagegen-frontend-web"
npx skills add https://github.com/Leonxlnx/taste-skill --skill "brandkit"
```

Pin v1 only if v2 breaks workflow: `--skill "design-taste-frontend-v1"`.

### 8.2 Project skill (GameMind bridge)

Repo includes `.cursor/skills/gamemind-taste-ui/SKILL.md` — tells the agent to read **this file** and respect GameMind hard constraints on any UI work.

### 8.3 Continuity habit

After each UI chat that changes visuals:

1. Append §7 change log
2. Update §1 Status / §4 lock if tokens changed
3. Tick Wave checkboxes in §5
4. One-line pointer in `PROJECT_CONTEXT.md` Last Session if milestone

New chat starter: use **Prompt T-Continue** below.

---

## 9. Prompt library (copy-paste)

Replace bracketed bits. Always work in Russian with the user unless asked otherwise; prompts may stay bilingual for the skill.

### Prompt T-Task — one backlog UI task in a fresh chat

Use for §14 tasks. **One task = one chat.** Commit code for that task before opening the next chat.

```txt
Продолжаем GameMind — UI Task [N]: [название из docs/TASTE_SKILL.md §14].

Прочитай:
- AGENTS.md
- docs/TASTE_SKILL.md (§1 Status, §4 lock, §6 audit, §13 strategy, §14 backlog)
- docs/PROJECT_CONTEXT.md
- docs/ROADMAP.md (§11.8)
- docs/DECISIONS.md (Taste Skill Visual Identity)

Режим: я пишу код сам — не реализуй файлы, только направляй.
Границы: только presentation layer. Не трогай scoring, snapshot, actions quiz hot path, entities, prisma, auth.

Ответ:
1) Цель задачи + список файлов
2) Почему это не затронет бизнес-логику
3) Полный код / точные вставки только для ПЕРВОГО файла
4) Как проверить
Жди «готово, следующий файл».
В конце напомни дописать §7 Change log и отметить Task [N] в §14.
```

### Prompt T-Continue — new chat, UI track

```txt
Продолжаем GameMind — UI / Taste Skill.

Прочитай:
- AGENTS.md
- docs/TASTE_SKILL.md  (главный файл по UI)
- docs/PROJECT_CONTEXT.md
- docs/ROADMAP.md (§11.8)
- docs/DECISIONS.md (Taste Skill Visual Identity)

Режим: я пишу код сам — не реализуй файлы, только направляй.
Задача: скажи статус Taste (foundation vs ongoing), следующий экран/шаг из Wave plan, и дай полный код/вставки только для ПЕРВОГО файла.
После моего «готово» — следующий файл.
В конце напомни, что дописать в docs/TASTE_SKILL.md §7 Change log.
```

### Prompt T-Audit — foundation audit only (no big rewrite)

```txt
Используй skill redesign-existing-projects + design-taste-frontend.

Проект: GameMind (Next.js App Router quiz). Прочитай docs/TASTE_SKILL.md §2–§3 и constraints.

Сделай ТОЛЬКО audit существующих экранов (home, auth, quiz setup/session, result, leaderboard, profile, admin questions). Не пиши большой redesign-код.

Выдай:
1) что сохранить
2) критичные UX/visual проблемы
3) предложенное visual direction (1 имя + 3–5 правил)
4) typography + color direction (в терминах наших CSS variables)
5) dials VARIANCE / MOTION / DENSITY с обоснованием
6) порядок Wave A/B (подтверди или поправь)
7) риски регресса (IMAGE_GUESS, i18n, themes)

Я вставлю ответ в docs/TASTE_SKILL.md §6.
```

### Prompt T-Lock — lock design system after audit

```txt
По аудиту в docs/TASTE_SKILL.md §6 и brief §3 зафиксируй design system lock.

Режим: направляй, я пишу сам.
Первый файл: src/app/globals.css (токены light+dark) — полный код.
Потом layout fonts, потом shared/ui primitives.
Не трогай entities/, prisma, Server Actions quiz hot path.
Dials: VARIANCE=__ MOTION=__ DENSITY=__ (из аудита).
```

### Prompt T-Screen — one screen redesign

```txt
Taste Skill: redesign-existing-projects + design-taste-frontend.
Экран: [HOME | LOGIN | REGISTER | QUIZ_SETUP | QUIZ_SESSION | RESULT | LEADERBOARD | PROFILE | ADMIN_QUESTIONS | ADMIN_USERS]

Прочитай docs/TASTE_SKILL.md (§4 lock обязателен).
Режим: я пишу сам, файл за файлом. Сначала список файлов, потом полный код первого.

Constraints из §2.4 — строго.
i18n: только dictionaries.
Тема: light+dark.
После волны напомню обновить §5 checkbox + §7 changelog.
```

### Prompt T-Feature — new product feature UI (ongoing forever)

```txt
Новая фича UI: [название, например Daily Challenge setup].

Прочитай docs/TASTE_SKILL.md (§4 Design system lock + §2.4 constraints).
Используй design-taste-frontend (и locked direction). Не изобретай новую палитру/шрифты — расширяй lock.
Сначала: как фича вписывается в существующие primitives (PageShell, Button, …).
Режим: направляй файл за файлом; я пишу сам.
В конце: текст для вставки в §7 Change log.
```

### Prompt T-Review — review my UI diff

```txt
Проверь мой UI-дифф для [экран/фича] в режиме Taste + GameMind.

Прочитай docs/TASTE_SKILL.md §4 lock и §2.4.
Структура ответа:
1) Что хорошо относительно lock
2) Критично (slop, регресс IMAGE_GUESS/i18n/theme, hardcoded strings, client/server)
3) Некритично
4) Соответствие dials / motion rules
5) Что дописать в §7 changelog
Не переписывай всё сразу.
```

### Prompt T-Implement — exception: AI edits files

```txt
Реализуй сам по Taste Skill: [экран или фича].
Прочитай docs/TASTE_SKILL.md. Constraints §2.4. Только presentation.
После изменений предложи текст для §7 Change log.
```

### Prompt T-Comps — optional image references first

```txt
Используй imagegen-frontend-web (и/или brandkit).
Brief из docs/TASTE_SKILL.md §3.
Сгенерируй 3–4 reference frames: home hero, quiz session, result, leaderboard.
Anti-slop, light+dark variants if possible.
Код не пиши — только изображения и короткий art-direction summary для §4.
```

---

## 10. Verification checklist (each wave / screen)

- [ ] `npm run build` (or at least typecheck) clean for touched files
- [ ] Light theme OK
- [ ] Dark theme OK (contrast + hierarchy parity)
- [ ] `/ru` and `/en` strings still from dictionaries
- [ ] Mobile: quiz options tappable; no horizontal junk
- [ ] IMAGE_GUESS not cropped; full frame
- [ ] Focus rings visible (`--ring`)
- [ ] No secrets / no DB logic in client components
- [ ] Smoke path: home → quiz → result → leaderboard
- [ ] §7 change log updated

---

## 11. Anti-patterns (project-specific)

- Starting foundation while Epic 4/5 incomplete on prod (~~obsolete~~ — cleared July 18)
- “Just make it pretty” without reading §4 lock / §13 strategy
- New feature with one-off hex colors bypassing tokens
- Mixing Taste UI PR with Neon SQL / repository split
- Heavy parallax/magnetic cursors on quiz answering
- Replacing Geist with another equally generic AI default without intention
- Admin looking like a marketing landing (keep density)
- Letting Taste rewrite Auth.js / quiz submit “for cleaner JSX”
- Pasting Stitch/Pencil generated app code into the repo
- Changing quiz to one-question-at-a-time without an explicit product decision

---

## 13. UI/UX Strategy (product canon)

### UI/UX Vision

GameMind — bilingual video-game quiz. Visual identity: **Scoreboard Editorial** — sharp, competitive-but-clean, editorial scoreboard; not SaaS purple, not neon casino, not marketing landing. Brand is hero on home; during quiz, question + answers are the only focus.

### Design Principles

1. Presentation only — never change scoring, snapshot, auth, or API for aesthetics.
2. One design language — extend tokens in `globals.css`; no parallel palettes.
3. Quiz calm, marketing presence — motion on home/result; quiet on answer UI.
4. Status is never color-only — text/icon + semantic color.
5. Mobile-first quiz — min 44px targets; progress and submit always reachable.
6. IMAGE_GUESS full-frame — no 16:9 crop regression.
7. i18n for all user-visible strings (`ru`/`en` dictionaries).

### UI/UX Scope and Boundaries

**In scope:** layout, tokens, typography, shared UI, visual states, a11y, UX copy, responsive.

**Out of scope without explicit ask:** Prisma/pg, scoring, timers/modes, auth/roles, routing contracts, domain types, deleting features, mass refactors.

If a UI idea needs logic change → stop, explain risk, propose minimal safe alternative, wait.

### Approved Tooling Workflow

| Tool | Use? | When | Transfer back |
|------|------|------|----------------|
| Taste Skill | Yes | Always for UI | Dials + anti-slop; hand-code |
| Google Stitch | Optional | Before/during lock exploration | Mood comps → §4; **no** paste code |
| Pencil.dev | Optional | After direction; component states | Spec → `shared/ui` by hand |
| Mobbin | Optional | Short reference pass | Notes only |
| axe DevTools | Yes | After quiz/result visual tasks | Fix a11y in presentation |
| Playwright | Later | After primitives exist | Smoke UI |
| Storybook | Optional later | After 4–5 primitives | Isolated components |
| Lucide | Yes, sparse | Icons for status/nav | Named icons only |
| shadcn/Radix | Not by default | Only if complex a11y primitive needed | Justify first |

1. Stitch (optional) → mood comps only.
2. Lock direction in §4 (code Task 1).
3. Pencil (optional) → component states.
4. Taste skills → anti-slop while implementing in Cursor.
5. Hand-code into existing architecture; never paste generated app code.
6. axe + manual light/dark/ru/en/mobile verify; Playwright later.

**Stitch prompt (saved):**

```txt
Design 3 mobile+desktop screens for GameMind, a bilingual video-game quiz web app.
Direction: "Scoreboard Editorial" — sharp, competitive-clean, editorial game-press feel.
Screens: (1) Home with strong GameMind brand + one CTA Start Quiz
(2) Quiz answering: question + 4 options as primary focus, progress answered/total, sticky submit
(3) Result: large score, correct count, play again / leaderboard CTAs, answer review below
Constraints: no glassmorphism, no purple SaaS gradients, no neon casino, no decorative orbs,
no card soup, light AND dark variants, large tap targets, status not color-only.
Do not invent timers (product has no timer yet). Output visual comps only, not production code.
```

**Pencil prompt (saved):**

```txt
Component spec for GameMind design system "Scoreboard Editorial".
Build: Button (primary/secondary/ghost/disabled/pending), AnswerOption (default/hover/focus/selected),
ProgressBar (0–100% answered), ResultSummary (score + correct/total).
Light+dark, mobile 390 and desktop 1280. No glass, quiet shadows, 8px spacing grid.
Export notes: colors as CSS variables names (--primary, --surface-muted, --ring, --success, --danger).
No app routing, no quiz logic.
```

### Design System Rules

- Tokens: background, foreground, muted, border, surface*, primary*, danger/success/warning*, ring, radius, shadow.
- Tailwind via `@theme inline` utilities only.
- Primitives live in `src/shared/ui` as introduced.
- Admin may be denser; public flows more spacious.

### Accessibility Requirements

- WCAG AA contrast for text/UI.
- Visible `:focus-visible` rings (`--ring`).
- Keyboard: options as radios/labels; filters as buttons with `aria-pressed`.
- `aria-busy` on pending submits; `role="alert"` on errors.
- Respect `prefers-reduced-motion`.
- Do not rely on color alone for correct/wrong.

### UI Review Checklist

- [ ] No business-logic files touched
- [ ] Tokens only (no one-off hex/neutral drift)
- [ ] Light + dark
- [ ] ru + en strings
- [ ] Mobile quiz scroll + sticky submit
- [ ] Focus states visible
- [ ] Loading/error/empty/disabled considered
- [ ] IMAGE_GUESS framing unchanged
- [ ] §7 change log updated

### Incremental Implementation Process

1. State goal + file list + why logic-safe + verify plan.
2. One small task (§14) per chat / PR.
3. User verifies in browser.
4. Commit code for that task; open a **new chat** for the next task (Prompt T-Task).
5. Log in §7; tick §14.

### Definition of Done (UI task)

- Visual goal met on target screens
- Boundaries respected
- Both themes + both locales smoke-checked for touched UI
- No new TypeScript/lint errors in touched files
- Verification steps written
- Continuity: §7 entry (and §4 if lock values changed); §14 checkbox

---

## 14. Incremental UI backlog (presentation only)

| Task | Priority | Effect | Touch | Verify | Risk |
|------|----------|--------|-------|--------|------|
| **1. Design tokens + typography** | P0 | Brand foundation | `globals.css`, fonts | light/dark, quiz unchanged structurally | Low | ✅ 2026-07-21 |
| **1b. Home brand hero** | P0 | Conversion + brand | home `page.tsx`, home i18n | CTA → quiz, brand test | Low | ✅ 2026-07-21 |
| **2. Button + focus states** | P0/P1 | Consistent CTAs | `shared/ui` + setup/session/result links | keyboard focus | Low | ✅ 2026-07-21 |
| **3. Answer options clarity** | P1 | Clear selection | `QuestionCard.tsx` | selected visible both themes | Low | ✅ 2026-07-21 |
| **4. Progress + sticky submit UX** | P1 | Clear blocker | `QuizSessionForm.tsx`, quiz i18n | disabled helper text | Low | ✅ 2026-07-21 |
| **5. Question screen polish** | P1 | Hierarchy; IMAGE_GUESS intact | `QuestionCard`, `QuestionImage`, session page | no crop | Low | ✅ 2026-07-21 |
| **6. Result summary hierarchy** | P1 | Motivation + CTA | result page (± presentational wrapper) | score numbers unchanged | Low | ✅ 2026-07-21 |
| **7. Mobile pass quiz flow** | P1 | 390px comfort | setup/session/result layout | sticky + options | Low | ✅ 2026-07-21 |
| **8. Loading / error / empty / disabled** | P2 | Consistency | `skeleton`, alerts, SubmitButton variants | no infinite spinners | Low | ✅ 2026-07-21 |
| **9. A11y + visual smoke** | P2 | Quality bar | axe; skip link; focus restore; reduced motion | checklist §13 | None/Low | ✅ 2026-07-21 |

**Foundation backlog (§14 Tasks 1–9 + Wave B):** **done on prod** 2026-07-22. Status = `ongoing`. New UI = Prompt T-Feature + §7; optional polish (leaderboard columns, Input/Field primitives) as needed.

**Ongoing admin UI backlog:**

- [x] Admin hub: TEXT / IMAGE_GUESS glance counts on Questions card + Users total caption / card rhythm. (2026-08-18)
- [x] Admin questions: edit-page publication controls + publicationStatus URL filter. (2026-07-26 late)
- [x] Admin questions: primary row action + “more” menu (desktop). (2026-07-27) Desktop = Edit + `⋯`; publication/isActive/delete in menu; native `<details>`; linear forward CTAs; list cache row-patch for snappy redirects.
- [x] Daily Challenge CTA on home + quiz setup (2026-07-30) — Scoreboard panel; guest→login; start/continue/result.
- [x] Daily Challenge today’s board under CTA (2026-07-30) — top-10 compact strip; **on prod** (user smoke OK).
- [x] Toast Notifications MVP (2026-07-30) — Sonner + unlock flash; Scoreboard cards; live theme/locale.
- [x] Achievement illustration semantics (Quiz Arcade) — 2026-08-16. Pack rules in DECISIONS Achievements MVP. New badges extend the plaque language (no gamepad / no `?` as quiz / no overflow-hidden).

**Ongoing brand:**

- [ ] Brand mark v2 — intentional logo; replace interim header GM + favicon chevrons (`docs/brand/` drafts are not canon).

**Cursor start prompt for Task 1:**

```txt
Продолжаем GameMind — UI Task 1: Design tokens + typography foundation.

Прочитай AGENTS.md, docs/TASTE_SKILL.md (§1, §4 Scoreboard Editorial, §6, §13, §14),
docs/PROJECT_CONTEXT.md, docs/ROADMAP.md (§11.8), docs/DECISIONS.md (Taste Skill Visual Identity).

Режим: я пишу код сам — не реализуй файлы.
Задача: расширь токены light+dark в globals.css под Scoreboard Editorial и подключи
отличимую пару next/font в layout.tsx. Не трогай quiz actions/scoring/entities.
Дай полный код первого файла (globals.css).
```

---

## 15. Links

- https://www.tasteskill.dev/
- https://github.com/Leonxlnx/taste-skill
- Live app: https://www.game-mind.ru
- Quiz images guide: `docs/QUIZ_IMAGES.md`
- Deploy: `docs/DEPLOY.md`
