# GameMind — первый публичный деплой

Цель: получить рабочий URL MVP, дальше развивать локально и выкладывать milestones заново.
**Не** откладывай запуск из‑за R2/Blob или полировки UI.

## Стек для v1

| Слой | Выбор |
|------|--------|
| Приложение | Vercel Hobby |
| БД | Neon (лучше отдельный production project/branch) |
| Картинки (seed) | `public/quiz-images/*.webp` в git (тот же origin) |
| Домен | Свой домен → Vercel (DNS у REG.RU; CF proxy не обязателен) |
| Upload (quiz + avatars) | **Vercel Blob** + same-origin `/media/...` (см. Media Storage ADR). Yandex S3 — fallback. **R2 не default**. |

## Чеклист перед деплоем

- [ ] Есть `.env.example`; реальные секреты только в локальном `.env` / env на Vercel
- [ ] Локально проходит `npm run build`
- [ ] WebP в `public/quiz-images/` закоммичены (не только оставшиеся SVG)
- [ ] Production Neon: миграции применены; seed (+ URL картинок) выполнен
- [ ] На Vercel заданы env (см. ниже)
- [ ] Сильный личный ADMIN; пароль админа друзьям не раздавать

## Обязательные переменные на Vercel

| Имя | Значение |
|-----|----------|
| `DATABASE_URL` | Neon **pooled** (`-pooler`, желательно `&pgbouncer=true`) |
| `DATABASE_URL_UNPOOLED` | Neon **direct** (без `-pooler`) |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_URL` | Сначала: `https://your-app.vercel.app` — потом: `https://your-domain.com` |
| `STORAGE_PROVIDER` | `vercel-blob` на Production (можно не задавать — на Vercel дефолт blob) |
| `BLOB_READ_WRITE_TOKEN` | Токен public Blob store (Vercel → Storage) |
| `BLOB_PUBLIC_BASE_URL` | `https://<storeId>.public.blob.vercel-storage.com` — для rewrite `/media/*` |

Задай их для **Production**. Preview для MVP может использовать ту же БД или отдельный Neon branch позже.

**Не** вставляй одну и ту же строку подключения в оба `DATABASE_URL` и `DATABASE_URL_UNPOOLED`.

## Локальный gate: сборка

```bash
npm run build
```

Исправь ошибки TypeScript / Next.js до подключения Vercel.
Скрипт `build` уже делает `prisma generate`.

## Production-база

1. Создай Neon project или branch для production (лучше не смешивать навсегда с «сонной» free-tier БД для local).
2. Примени миграции на prod (с машины/CI, где Prisma migrate стабилен, или через твои Windows helper-скрипты).
3. Seed:

   ```bash
   # временно укажи в .env PRODUCTION URL, либо аккуратно через Neon SQL
   npm run db:seed
   npm run images:update-db
   ```

4. Создай/сделай ADMIN-пользователя с сильным паролем.

## Шаги на Vercel

1. Запушь репо на GitHub (WebP — да; `.env` — никогда).
2. New Project → import repo → Framework: Next.js.
3. Добавь env из таблицы выше.
4. Deploy.
5. Открой `https://your-app.vercel.app/ru` (или `/en`).

### Smoke-тест после первого деплоя

- [ ] Регистрация нового пользователя
- [ ] Старт квиза (сессия, где могут попасться `IMAGE_GUESS`)
- [ ] Submit → страница результата
- [ ] Leaderboard показывает строку
- [ ] Login / logout
- [ ] Admin (только твой аккаунт): `/ru/admin/questions` открывается

## Свой домен

**Статус (июль 2026):** `game-mind.ru` / `www.game-mind.ru` привязаны к Vercel (Valid). Production primary — **www**. Друзьям: `https://www.game-mind.ru`.

1. Vercel → Project → Domains → добавить домен.
2. У регистратора **или** в Cloudflare: CNAME/A по инструкции Vercel. Если `*.vercel.app` плохо открывается у друзей — Cloudflare Free NS + оранжевое облако (proxy).
3. Дождись SSL / Valid Configuration (DNS может «догнать» через минуты–часы).
4. Поставь `AUTH_URL` = `https://www.game-mind.ru` (без `/` в конце; совпадать с primary) и **сделай redeploy**.
5. Друзьям давай только кастомный домен.

## Явно позже (когда URL уже работает)

- ~~Admin-загрузка / Avatar Phase B~~ — **на prod July 23** (Blob env + SharedArrayBuffer fix)
- Profile polish / achievements / daily challenge
- Admin: фильтры, поиск, draft workflow

## Media storage (кратко)

1. Vercel → Storage → создать **public** Blob store → скопировать `BLOB_READ_WRITE_TOKEN`.
2. После первого upload (или из UI store) взять host вида `https://….public.blob.vercel-storage.com` → `BLOB_PUBLIC_BASE_URL`.
3. Redeploy, чтобы `next.config` подхватил rewrite `/media/:path* → Blob`.
4. В БД храним относительные `/media/quiz/...` и `/media/avatars/...`; seed остаётся `/quiz-images/...`.
5. Локально без токена: `STORAGE_PROVIDER=local-public` (или не задавать) → файлы в `public/media/` (gitignore).
6. Next 16.2: лимит тела Server Action — `experimental.serverActions.bodySizeLimit` (напр. `3mb`). Top-level `serverActions` в этом релизе **не** принимается.
7. sharp → Blob: на Vercel копируй в owned `ArrayBuffer`/`Buffer.alloc` перед `put` (SharedArrayBuffer); `serverExternalPackages: ['sharp','@vercel/blob']`.

### Smoke media (после deploy / локально)

- [x] Avatar: upload jpeg/png/webp → header + profile circle (`object-cover`) — **prod OK July 23**
- [ ] Avatar: clear → NULL
- [ ] Admin: IMAGE_GUESS file upload → `QuestionAsset.url` вида `/media/quiz/...`
- [ ] Прямой URL `https://www.game-mind.ru/media/...` (или localhost `/media/...`) открывается **без VPN**
- [ ] Seed `https://www.game-mind.ru/quiz-images/easy/super-mario-bros.webp` без регрессии
- [ ] Quiz session IMAGE_GUESS: full-frame `object-contain`; scoring/auth OK

Подробности: `docs/DECISIONS.md` → Media Storage And Upload (RU-first).

## Если что-то ломается

| Симптом | Вероятная причина |
|---------|-------------------|
| Build падает на Vercel, локально ок | Нет env; Prisma generate; смотри build logs |
| Сайт есть, login сломан | Нет/неверный `AUTH_SECRET` или `AUTH_URL` |
| Ошибки БД в quiz/admin | Перепутаны pooled/unpooled; миграции на prod не применены |
| `IMAGE_GUESS` — битая картинка | WebP не в деплое; на prod DB не обновлены asset URL |
| `Body exceeded 1 MB limit` на upload | Нет `experimental.serverActions.bodySizeLimit` / нужен restart после next.config |
| `/media/...` 404 на prod | Нет `BLOB_PUBLIC_BASE_URL` или Blob store / rewrite |
| `SharedArrayBuffer is not allowed` на upload | sharp Buffer → Blob put без owned copy; см. ADR ops note |
| Друзьям не открывается `*.vercel.app` | Привяжи домен (уже: `www.game-mind.ru`) |

## Связанные документы

- `docs/QUIZ_IMAGES.md` — пайплайн картинок
- Локальный continuity (в git не коммитится): `docs/PROJECT_CONTEXT.md` → Public Deploy Plan
