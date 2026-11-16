-- Итоги сыгранных комнат (ROADMAP 5.5, ступень 2, v3 — рейтинг комнат, вариант А).
-- RoomResult — место, очки, верные и награды игрока в доигранной комнате;
-- пишется один раз при конце игры (INSERT … ON CONFLICT DO NOTHING) и не
-- меняется. Читают: «Таблица компании», «Счёт встреч», профиль «Комнаты».
-- В общий рейтинг не идёт. Уже сыгранные комнаты досчитывает скрипт
-- scripts/backfill-room-results.ts.
-- Additive: одна новая таблица, существующие не меняются; работающий код её
-- не читает — порядок «миграция → деплой» безопасен.
-- Canon: docs/DECISIONS.md → Quiz room.

-- CreateTable
CREATE TABLE "RoomResult" (
    "playerId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "correctCount" INTEGER NOT NULL,
    "playersCount" INTEGER NOT NULL,
    "questionCount" INTEGER NOT NULL,
    "awards" TEXT[],
    "finishedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RoomResult_pkey" PRIMARY KEY ("playerId")
);

-- CreateIndex
CREATE INDEX "RoomResult_userId_finishedAt_idx" ON "RoomResult"("userId", "finishedAt");

-- CreateIndex
CREATE INDEX "RoomResult_roomId_idx" ON "RoomResult"("roomId");

-- AddForeignKey
ALTER TABLE "RoomResult" ADD CONSTRAINT "RoomResult_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "RoomPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomResult" ADD CONSTRAINT "RoomResult_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomResult" ADD CONSTRAINT "RoomResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

