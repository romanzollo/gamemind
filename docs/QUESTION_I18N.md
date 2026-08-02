# GameMind — Question bilingual content (RU / EN)

How to write and store quiz questions so **both locales look consistent**.  
Canon for storage: `QuestionTranslation` + `AnswerOptionTranslation` (locales `ru` | `en`); quiz UI picks text by route locale from snapshot `texts.ru` / `texts.en`.

Related: `docs/QUIZ_IMAGES.md` (IMAGE_GUESS assets), `scripts/seed-questions.cjs`, admin form `AdminQuestionForm`, helper `scripts/fix-ru-answer-labels.cjs`.

---

## 1. Product rule (non-negotiable)

On `/ru` the player must see a **coherent Russian set**: question + **all four** options in the same language strategy.

On `/en` — the same for English.

| Bad (bug we hit) | Good |
|------------------|------|
| Question RU, correct «Палач Рока», distractors `Duke Nukem` / `Doomguy Jr.` | Question RU + all options RU; EN row has EN equivalents |
| Only fill RU for the correct answer; leave wrong answers as English paste | Fill **both** `optionTextRu-*` and `optionTextEn-*` for **every** option |

**Anti-pattern:** “correct answer localized, distractors left as English because they’re proper names.”  
If the **correct** answer is localized (or Cyrillic), **localize the distractors the same way** (official RU name, established transliteration, or deliberate shared brand — see §3).

---

## 2. What the app stores

Each question has:

- Question text: `ru` + `en` (required in admin / seed)
- Exactly **4** options; exactly **one** `isCorrect`
- Each option: `ru` text + `en` text

Seed helper:

```js
opt(isCorrect, ru, en)
// example
opt(true, 'Палач Рока', 'Doom Slayer'),
opt(false, 'Дюк Нюкем', 'Duke Nukem'),
```

Admin fields (create/edit):

- Question: RU text + EN text  
- Options: `optionTextRu-{0..3}` + `optionTextEn-{0..3}`

At quiz start, snapshot v2 freezes `texts: { ru, en }` per question and option.  
**Already started sessions do not pick up later DB text fixes** — only **new** sessions.

---

## 3. Localization strategies (pick one per option set)

### A. Full localization (preferred for characters, places, lore)

| RU | EN |
|----|-----|
| Палач Рока | Doom Slayer |
| Восторг | Rapture |
| Коммандер Шепард | Commander Shepard |
| Дюк Нюкем | Duke Nukem |

Use official game localization when it exists; otherwise a clear, consistent transliteration.

### B. Shared brand / title (OK when **all four** options are titles)

Game titles often stay Latin in both locales:

```js
opt(true, 'Elden Ring', 'Elden Ring'),
opt(false, 'Bloodborne', 'Bloodborne'),
// ...
```

This is fine: on `/ru` the player still sees a **uniform** Latin title set, not a mix of Cyrillic correct + English wrong.

### C. Forbidden mix

```js
// DO NOT
opt(true, 'Палач Рока', 'Doom Slayer'),
opt(false, 'Duke Nukem', 'Duke Nukem'), // RU column is English while correct is Cyrillic
```

**Checklist before save/publish:**

1. Open the four RU strings together — do they feel like one language “scene”?  
2. Open the four EN strings — same.  
3. If any RU option has Cyrillic and another is Latin-only **letters-only English**, justify it (strategy B for *all* options) or fix the Latin ones.

---

## 4. Adding questions — workflows

### Admin UI

1. Fill question RU + EN.  
2. For **each** of 4 options: fill RU **and** EN (never leave EN empty; never leave RU as English paste “for later”).  
3. Mark one correct.  
4. Publish quality gate still applies (duplicates, etc.).  
5. Smoke: start a quiz on `/ru` and `/en`, check that question.

### Seed (`scripts/seed-questions.cjs`)

1. Use `opt(isCorrect, ru, en)` — both strings every time.  
2. Prefer strategy A for character/place answers; B for title-guess sets.  
3. After editing seed on an existing DB, either re-seed carefully or run a targeted UPDATE script (see §5).  
4. `npm run db:verify-i18n` — smoke that translations exist (does not catch “mixed language feel”).

### IMAGE_GUESS

Same option rules as TEXT. Prompt image guide: `docs/QUIZ_IMAGES.md`.

---

## 5. Fixing bad data already in the DB

Helper: `scripts/fix-ru-answer-labels.cjs`  
(one UPDATE per connection — Neon/Windows friendly).

- Updates `AnswerOptionTranslation` where `locale = 'ru'` and legacy `AnswerOption.text` when it matched the old English string.  
- Extend the `fixes` array for new known bad pairs.  
- Re-run is idempotent for already-fixed rows.  
- **Prod:** run the same script against prod unpooled URL when shipping content fixes.  
- Players mid-session still see old snapshot text until they start a **new** quiz.

---

## 6. Audit query (find mixed sets)

“Mixed” = same question has ≥1 option with Cyrillic **and** ≥1 option that is Latin-only (letters, no Cyrillic).  
Useful to catch the DOOM-style bug; title-only sets (all Latin) will not match.

```sql
WITH opt AS (
  SELECT ao."questionId" AS qid,
         COALESCE(aot.text, ao.text) AS ru_text
  FROM "AnswerOption" ao
  LEFT JOIN "AnswerOptionTranslation" aot
    ON aot."optionId" = ao.id AND aot.locale = 'ru'
),
scored AS (
  SELECT qid,
         COUNT(*) FILTER (WHERE ru_text ~ '[А-Яа-яЁё]') AS cyr,
         COUNT(*) FILTER (
           WHERE ru_text !~ '[А-Яа-яЁё]' AND ru_text ~ '[A-Za-z]'
         ) AS latin_only
  FROM opt
  GROUP BY qid
)
SELECT s.qid, s.cyr, s.latin_only, qt.text AS question_ru
FROM scored s
JOIN "QuestionTranslation" qt
  ON qt."questionId" = s.qid AND qt.locale = 'ru'
WHERE s.cyr > 0 AND s.latin_only > 0
ORDER BY s.latin_only DESC;
```

Target: **0 rows** for character/lore banks.  
All-Latin title questions are OK and will not appear here.

Also check: no option missing a `ru` translation row.

---

## 7. Snapshot / locale switch (why both languages matter)

- Snapshot v2 stores **both** `texts.ru` and `texts.en`.  
- UI uses route locale via `pickSnapshotText` (preferred locale → `ru` fallback → other → legacy).  
- Mid-session RU↔EN switch works only if both sides were filled at start.  
- Empty EN with filled RU (or the reverse) causes fallback to the other language — feels like “half-translated” UI.

---

## 8. Quick authoring examples

**Character (localize all):**

```js
opt(true, 'Палач Рока', 'Doom Slayer'),
opt(false, 'Дюк Нюкем', 'Duke Nukem'),
opt(false, 'Думгай-младший', 'Doomguy Jr.'),
opt(false, 'Би.Джей Блазкович', 'B.J. Blazkowicz'),
```

**Titles (shared Latin OK):**

```js
opt(true, 'Elden Ring', 'Elden Ring'),
opt(false, 'Dark Souls III', 'Dark Souls III'),
opt(false, 'Bloodborne', 'Bloodborne'),
opt(false, 'Sekiro: Shadows Die Twice', 'Sekiro: Shadows Die Twice'),
```

**Place (localize all):**

```js
opt(true, 'Восторг', 'Rapture'),
opt(false, 'Колумбия', 'Columbia'),
opt(false, 'Данвич', 'Dunwich'),
opt(false, 'Аркадия', 'Arcadia'),
```

---

## 9. Definition of done (new question)

- [ ] Question text RU + EN filled  
- [ ] Four options; one correct  
- [ ] Every option has RU **and** EN  
- [ ] RU option set is one strategy (A or B), not a mix of “localized correct + English distractors”  
- [ ] EN option set consistent  
- [ ] Smoke `/ru` and `/en` (or Prisma Studio translations)  
- [ ] IMAGE_GUESS: asset rules in `QUIZ_IMAGES.md`  

When in doubt: **localize distractors the same way you localized the correct answer.**
