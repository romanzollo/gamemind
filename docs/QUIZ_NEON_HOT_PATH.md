# Quiz + Neon hot path (canon)

**Status:** binding for GameMind quiz start / submit / result on Neon Direct `pg`.  
**Why this file is tracked:** local continuity docs (`DECISIONS.md`, `AGENTS.md`) are gitignored; this rule must survive clones and new chats.  
**Companion:** Cursor rule `.cursor/rules/quiz-neon-hot-path.mdc` (`alwaysApply`).  
**Playbook detail:** `docs/DECISIONS.md` → Quiz Start / Session Load Playbook (gitignored locally — keep in sync when you edit).

---

## Lesson (Aug 4, 2026) — one day, one root cause

On **Windows + Neon unpooled + `next dev`**, quiz uses a **single process-wide Direct queue**.

| Symptom | Real cause |
|---------|------------|
| `SUBMIT_FAILED`, complete ~19s, `Connection terminated` | Critical hop wrote/read **large JSONB/TOAST** (or Node→`$n::jsonb` of fat payload) together with answers + COMPLETED |
| Result score OK, review hangs / soft-fail | Reading `reviewSnapshot` / session `snapshotData` TOAST right after write |
| Home / Daily CTA “freezes” after quiz | Hung review/submit held the **same** Direct queue (`waiters` climb) |
| Sticky 404 on `/result/:id` though row exists | `notFound()` + App Router cache |

SQL outside Next for the same rows was fine (~ms). Indexes were not the bug.

**Working fix:**

1. **Complete critical path = scalars only** — `QuizAnswer` + `QuizResult` score fields via `VALUES` + `COMPLETED` + `AchievementOutbox`.
2. **No** `reviewSnapshot` / fat JSON on that hop.
3. **`reviewPayload`** (slim bilingual DTO) only **after** successful complete, non-blocking; must not fail submit.
4. Result **summary** = scalars; **review** = client API; soft-miss, never sticky `notFound()`.

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

### C. Start (unchanged by this incident — still canon)

- Classic / Timed **separate runners**; pick resolve **chunk size 5**.
- `timedEndsAt` **after** pick.
- Daily lobby **1** Direct TLS.
- Keep-warm on quiz Direct queue **OFF**.

### D. Direct queue

- One `withDirectPgQueue` for the next-dev process.
- Hung hop ≈ whole app feels dead. Prefer fail soft / short attempt on non-critical reads over infinite wait.
- After wedge: **restart `npm run dev`**, stop F5 spam.

---

## Content scale / new questions

Safe and expected:

- Draft JSON → validate → import DRAFT → admin publish.
- Larger pool, more bilingual rows, images via existing media path.
- Prod import against **prod** Neon only; after any schema-changing quiz deploy, run `prisma migrate deploy` on prod (missing `AchievementOutbox` / review columns → submit/result break). Ops notes: `docs/CONTENT_PIPELINE.md` §10.

**Not required and often harmful:**

- Changing submit/result to “embed more question JSON”.
- Reading live `Question` rows on submit for scoring (use frozen session snapshot already loaded for scoring).
- Adding JSONB columns to the complete hop “for convenience”.
- Assuming content import or Vercel redeploy applied Prisma migrations.

Snapshot at **start** already freezes the set. Submit only needs option ids + `isCorrect` from that in-memory snapshot.

---

## Change checklist (any PR / chat touching quiz DB)

Before merge or “готово”:

- [ ] Classic 3 / 5 / 10 **start**
- [ ] Classic **submit → score** &lt; ~2–3s (`quiz.submit.complete` `phase=ok`)
- [ ] Blitz start + submit → score
- [ ] Daily start + submit → score (if attempt available)
- [ ] Home after result not stuck 20–30s
- [ ] If you touched pick/chunk/Direct/settle: full matrix + update this file + playbook

If only content/admin questions changed and **no** quiz-session/submit/result/direct-pg edits: matrix optional; still do not “drive-by” hot path.

---

## Recovery (when it breaks again)

1. Terminal: find last `Direct pg hop quiz.submit.*` / `quiz.result.*` — note `operation=` and `waiters=`.
2. Restart `npm run dev` if `waiters` high or connects pile up.
3. Ask: did the last change put JSONB/TOAST on complete or blocking result read? **Revert that**, do not bump timeouts.
4. Score broken → fix complete scalars. Review broken → soft-fail OK; fix payload hop separately.
5. Do not re-enable keep-warm; do not merge Classic/Timed start; do not expand Daily lobby TLS.

---

## Related code

| Area | Path |
|------|------|
| Direct queue | `src/lib/db/direct-pg.ts` |
| Submit complete | `src/entities/quiz-session/quiz-session-submit.repository.ts` |
| Result summary/review | `src/entities/quiz-result/quiz-result.repository.ts` |
| Compact payload type | `src/entities/quiz-result/compact-review-payload.ts` |
| Review API | `src/app/api/result/[sessionId]/review/route.ts` |
| Result page | `src/app/[locale]/(public)/result/[sessionId]/page.tsx` |

---

## History pointer

Aug 4 incident chain: destroy-on-success → session TOAST read after write → outbox → summary/review split → client review → `reviewPayload` on complete (broke submit) → **scalars-only complete + deferred payload** (matrix green).
