# Quiz + Neon hot path (canon)

**Status:** binding for GameMind quiz start / play-load / submit / result.  
**Priority: production (Vercel + prod Neon).** Local `next dev` on Windows is a harsher TLS lab — use it to *find* bugs, not to invent prod-only timeouts, keep-warm, or extra Direct hops. A fix that only papers over Windows `next dev` and false-fails cold Neon on www is wrong.  
**Companion:** Cursor rule `.cursor/rules/quiz-neon-hot-path.mdc` (`alwaysApply`).  
**Playbook detail:** `docs/DECISIONS.md` → Quiz Start / Session Load Playbook.  
**Overview:** `docs/ARCHITECTURE.md`.

`docs/DECISIONS.md` / `AGENTS.md` / `CLAUDE.md` are **tracked**. Chat diary `docs/PROJECT_CONTEXT.md` is gitignored — do not treat it as canon.

---

## Product priority (do not invert)

1. **Production** Classic / Blitz / Daily: start → questions on screen → **submit saves score** → result summary paints. That path is the release gate.
2. Local Windows `next dev` must not wedge the shared Direct queue (home/Daily/start look dead). Workarounds (queue, 300ms settle, 5s play-load timeout, in-memory handoff) exist **because** of that lab — they must not make prod worse (example: 5s play-load timeout → false soft-miss on cold Neon).
3. Answer **review** and polish are best-effort — never block (1).

---

## Lesson (Aug 4, 2026) — submit / result

On **Windows + Neon unpooled + `next dev`**, quiz uses a **single process-wide Direct queue**.

| Symptom | Real cause |
|---------|------------|
| `SUBMIT_FAILED`, complete ~19s, `Connection terminated` | Critical hop wrote/read **large JSONB/TOAST** together with answers + COMPLETED |
| Result score OK, review hangs / soft-fail | Reading `reviewSnapshot` / session `snapshotData` TOAST right after write |
| Home / Daily CTA “freezes” after quiz | Hung hop held the **same** Direct queue (`waiters` climb) |
| Sticky 404 on `/result/:id` though row exists | `notFound()` + App Router cache |

SQL outside Next for the same rows was fine (~ms). Indexes were not the bug.

**Working fix:** complete = scalars only; `reviewPayload` after success, non-blocking; result summary first; soft-miss, never sticky `notFound()`.

---

## Lesson (Aug 14, 2026) — start / play-load / Blitz clock

Create can be healthy (`quiz.start.create phase=ok`) while the **next** hop dies.

| Symptom | Real cause |
|---------|------------|
| Blitz page: three skeletons ~40s; `load-snapshot` operation ~18s×2 | Play-load did **UPDATE `timedEndsAt`** on the **same** Direct client as **SELECT `snapshotData` TOAST** |
| After 2× `pick.resolve`, no `create` log, infinite lobby spinner | Timed **abandon UPDATE** + JSONB **INSERT** on one Direct write client **without timeout** |
| Quiz loads, countdown **00:00**, auto-submit `?clock=1` | SQL `NOW()+duration` into `TIMESTAMP` **without TZ**; node-pg reads as **local** (UTC+2 → deadline ~2h in the past) |
| Classic MIX / Blitz SINGLE: create OK, then ~37s yellow soft-miss; retry start OK | **SELECT `snapshotData` TOAST** immediately after INSERT (Direct *or* pooled). Row exists; query hangs. Second start later ~60ms |
| Home GET ~20s after a hung play-load | Same Direct queue (if the read was Direct) |

**Working shape (canon):**

```txt
Blitz:  pooled abandon (scalar, before pick)
All:    cycle pooled (outside Direct queue) → 300ms settle
        → resolve chunk 5 Direct → create Direct INSERT-only JSONB
        → remember play-load DTO in process memory (no isCorrect)
Page:   take handoff (same Node isolate) OR pooled SELECT snapshotData
        dev timeout 5s / prod 18s; miss → retry 400ms → soft-miss (not notFound)
Clock:  Date.now()+duration AFTER connect, on INSERT (JS Date, not SQL NOW())
Create: withDirectPgWriteClient — do NOT move back to withDirectPgQuizStartClient
```

Do **not** “fix” this by raising global Direct timeouts or re-enabling keep-warm.

---

## Invariants (do not violate)

### A. Submit / complete

```txt
OK:   status check → INSERT answers → INSERT QuizResult(scalars) → UPDATE COMPLETED → outbox
BAD:  anything that SELECT/INSERT/UPDATE large snapshotData / reviewSnapshot / fat JSONB on this hop
BAD:  sync award TLS before redirect
```

Code: `src/entities/quiz-session/quiz-session-submit.repository.ts`.

### B. Result

```txt
OK:   findSummary (scalars) → paint score → Suspense award → client review loader
BAD:  blocking RSC read of large JSONB before score
BAD:  notFound() on miss/timeout
```

### C. Start (pick + create)

- Classic / Timed **separate runners**; pick resolve **chunk size 5** (do not change without matrix).
- Classic / Timed pick ids via **UserQuestionCycle** (seeded cursor scalars), then resolve-by-ids.
- Cycle hop: raw `pg` **`withPooledPgClient`** — **outside** shared Direct queue (never `withDirectPg*` for cycle).
- After **any** cycle (SINGLE and Mix): **300ms settle** before Direct resolve (`pick-quiz-snapshot-bundle.ts`). Mix is not special here.
- Mix: 3× existing difficulty bags + shuffle + one chunked resolve. Not `Difficulty = MIXED` in the cycle table. Daily does **not** use the cycle.
- Boundary: **reshuffle-first** when remaining &lt; needed. No silent random fallback if cycle fails.
- Create: **`withDirectPgWriteClient`**, INSERT `snapshotData` only. Do **not** return create to `withDirectPgQuizStartClient`.
- Timed abandon: **pooled scalar UPDATE before pick**. Never UPDATE orphans on the same Direct client as JSONB INSERT. Never a second **unpooled** hop solely for abandon.
- Keep-warm on quiz Direct queue **OFF**.

### D. Play-load (quiz session page)

```txt
OK:   take in-memory handoff from create (same process) → paint questions
OK:   handoff miss → pooled SELECT snapshotData (prod 18s; next-dev 5s)
OK:   still miss → retry 400ms → soft-miss UI (not notFound())
BAD:  SELECT snapshotData TOAST on Direct immediately after create INSERT
BAD:  UPDATE timedEndsAt on the same client as SELECT snapshotData
BAD:  Direct relational JOIN fallback after TOAST timeout (second 18s hang)
```

Handoff (`play-load-handoff.ts`): TTL ~45s, one `take`, `userId` check. **Not** the source of truth — refresh / other serverless isolate / scoring always use Postgres.

On **production**, Server Action and RSC GET often hit **different isolates** → handoff miss is **normal**. The pooled SELECT **is** the prod path. Do not shrink its timeout to the Windows fail-fast 5s.

### E. Blitz clock (`timedEndsAt`)

Column is Prisma `DateTime` → `TIMESTAMP(3)` **without** time zone.

```txt
OK:   after Direct connect, INSERT Date.now()+durationSeconds as JS Date
      (node-pg local serialize matches local parse on Windows UTC+2 and UTC prod)
BAD:  Date.now()+60 in JS BEFORE create hop (slow TLS → «осталось 35с»)
BAD:  SQL NOW()+interval into naive TIMESTAMP (node-pg treats UTC wall as local
      → UTC+2 immediately «время вышло» + auto-submit ?clock=1)
BAD:  arming NOW()+duration on play-load together with TOAST SELECT
```

Refresh must **not** reset the deadline (play-load does not UPDATE `timedEndsAt`).

### F. Direct queue

- One `withDirectPgQueue` for the **`next dev` process only** (`NODE_ENV=development`). Production skips the queue.
- Hung hop ≈ whole local app feels dead. Prefer fail soft / short attempt on non-critical reads over infinite wait. Write create has an 18s attempt cap so it cannot spin forever.
- After wedge: **restart `npm run dev`**, stop F5 spam.
- UserQuestionCycle must **not** sit on this queue.

---

## Content scale / new questions

Safe and expected:

- Draft JSON → validate → import DRAFT → admin publish.
- Larger pool, more bilingual rows, images via existing media path.
- Prod import against **prod** Neon only; after any schema-changing quiz deploy, run `prisma migrate deploy` on prod (Windows may need SQL + `_prisma_migrations` if `P1002`). Ops: `docs/CONTENT_PIPELINE.md` §10. Aug 15: missing `QuizSession.poolKind` (`42703`) broke all Classic/Blitz starts on www until that catch-up — not a handoff/clock bug.

**Not required and often harmful:**

- Changing submit/result to “embed more question JSON”.
- Reading live `Question` rows on submit for scoring (use frozen session snapshot).
- Adding JSONB columns to the complete hop “for convenience”.
- Reading `snapshotData` TOAST on the play-load hop “to be sure” when handoff already has the DTO.
- Assuming content import or Vercel redeploy applied Prisma migrations.

Snapshot at **start** already freezes the set. Submit only needs option ids + `isCorrect` from that snapshot (DB or already-loaded memory on the submit request — not a new TOAST read glued to complete).

---

## Change checklist (any PR / chat touching quiz DB)

Before merge or “готово” — **prod is the gate**, local matrix is how we catch Windows TLS:

- [ ] Classic EASY 3 start + submit → score
- [ ] Classic MIX (same count you ship in lobby) start + questions on screen (not 37s soft-miss)
- [ ] Classic single difficulty 10 start (if lobby allows) — play-load not 18s×2
- [ ] Blitz MIX 10 start; countdown ≈60s when questions paint; refresh does not reset clock
- [ ] Blitz single difficulty 10 start + questions on screen
- [ ] Blitz / Classic **submit → score** &lt; ~2–3s (`quiz.submit.complete` `phase=ok`)
- [ ] Daily start + submit → score (if attempt available)
- [ ] Home after start/result not stuck ~20s
- [ ] If you touched pick/chunk/Direct/settle/play-load/clock: full matrix + update **this file** + playbook

If only content/admin questions changed and **no** quiz-session/submit/result/direct-pg edits: matrix optional; still do not “drive-by” hot path.

After deploy to www: repeat Classic EASY 3 + Blitz MIX start→score (cold Neon). Local green ≠ prod green.

---

## Recovery (when it breaks again)

1. Terminal: last `quiz.start.*` / `quiz.session.load-snapshot` / `quiz.submit.*` / `quiz.result.*` — `operation=` / `waiters=` / `phase=`.
2. Restart `npm run dev` if `waiters` high or writes have no timeout.
3. Ask which anti-pattern landed:
   - JSONB on **complete** → revert; do not bump timeouts.
   - SELECT/UPDATE TOAST on **play-load** → handoff + pooled fallback; no UPDATE on that client.
   - SQL `NOW()` into naive `TIMESTAMP` → JS Date after connect.
   - abandon+INSERT on one Direct client → pooled abandon before pick.
4. Score broken → complete scalars. Review broken → soft-fail OK. Soft-miss on known new session → handoff miss + TOAST read, not “row missing”.
5. Do not re-enable keep-warm; do not merge Classic/Timed start; do not expand Daily lobby TLS; do not change chunk size without matrix.
6. Classic/Timed start dies after cycle with Prisma `Connection terminated` → cycle stays on `withPooledPgClient`.
7. Start UI generic filter error + Vercel `42703` `poolKind` (or any missing Mix/session column) → prod schema lag. Ops: `CONTENT_PIPELINE.md` §10. Do not change handoff/clock/Direct.

---

## Related code

| Area | Path |
|------|------|
| Direct queue / pooled cycle helper | `src/lib/db/direct-pg.ts` |
| UserQuestionCycle | `src/entities/user-question-cycle/*` |
| Classic/Timed pick + 300ms settle | `src/features/quiz/lib/pick-quiz-snapshot-bundle.ts` |
| Create + clock + handoff stash | `src/entities/quiz-session/quiz-session-start.repository.ts` |
| Play-load Map | `src/entities/quiz-session/play-load-handoff.ts` |
| Play-load read (handoff then pooled) | `src/entities/quiz-session/quiz-session-reads.repository.ts` |
| Timed start (abandon then pick) | `src/features/timed-mode/lib/run-timed-quiz-start.ts` |
| Quiz session page (soft-miss) | `src/app/[locale]/(public)/quiz/[sessionId]/page.tsx` |
| Submit complete | `src/entities/quiz-session/quiz-session-submit.repository.ts` |
| Result summary/review | `src/entities/quiz-result/quiz-result.repository.ts` |
| Compact payload type | `src/entities/quiz-result/compact-review-payload.ts` |
| Review API | `src/app/api/result/[sessionId]/review/route.ts` |
| Result page | `src/app/[locale]/(public)/result/[sessionId]/page.tsx` |

---

## History pointer

Aug 4: destroy-on-success → session TOAST after write → **scalars-only complete + deferred `reviewPayload`**.

Aug 12: Direct-queue cycle wedge → Prisma JSONB bag + random fallback → **pooled raw `pg` cycle** + **reshuffle-first** (`a84ebdb`, `382f795`).

Aug 14 (`3a2d42b`): play-load TOAST+UPDATE → abandon+INSERT hang → SQL `NOW()` TZ → SELECT TOAST after INSERT soft-miss → **handoff + pooled fallback (dev 5s / prod 18s) + JS clock after connect + pooled abandon before pick**.
