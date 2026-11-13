-- Воронка (ROADMAP 3.5a): события до игры — визит, страница, шторка режима,
-- «Поделиться», регистрация. Путь от старта игры сюда не пишется: он уже есть
-- в QuizSession / QuizAnswer / QuizResult.
-- Без IP, User-Agent и полного URL; visitId — случайный, живёт одну вкладку.
-- FK на User — CASCADE: удалённый игрок уносит свои события.
-- Additive: новая таблица, работающий код её не читает — порядок
-- «миграция → деплой» безопасен.
-- Canon: docs/DECISIONS.md → Funnel analytics: own events + existing tables.

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "userId" TEXT,
    "props" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalyticsEvent_createdAt_idx" ON "AnalyticsEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_name_createdAt_idx" ON "AnalyticsEvent"("name", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_userId_idx" ON "AnalyticsEvent"("userId");

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
