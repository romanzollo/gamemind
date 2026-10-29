-- RateLimitBucket: общий счётчик rate limit для всех инстансов (auth, пароль, аватар, админка).
-- Additive: новая таблица, старый код её не читает. Применять на prod ДО деплоя кода,
-- иначе лимит молча уходит в память инстанса (fallback) и шлёт warning в Sentry.
-- Canon: docs/DECISIONS.md → Shared rate limit and favicon.ico.
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");
