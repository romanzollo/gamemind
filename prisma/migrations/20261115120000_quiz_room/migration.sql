-- Комната с кодом (ROADMAP 5.5, ступень 2): живая викторина для 2–12 игроков.
-- Room — код, ведущий, настройки, статус; RoomPlayer — игроки (id = публичный
-- идентификатор); RoomQuestion — замороженные вопросы с расписанием
-- (introAt / openAt / closeAt); RoomAnswer — ответы с очками.
-- Все времена — TIMESTAMPTZ(3): пишутся из JS Date, сравниваются с временем
-- прихода запроса (canon E, без SQL NOW() в часах).
-- Room.code — nullable UNIQUE: код освобождается (NULL) для новой комнаты,
-- когда прежняя сыграна, закрыта или брошена.
-- Additive: две enum, четыре новые таблицы; существующие таблицы не меняются,
-- работающий код новые таблицы не читает — порядок «миграция → деплой» безопасен.
-- Canon: docs/DECISIONS.md → Quiz room.

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('LOBBY', 'STARTING', 'PLAYING', 'FINISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "RoomPlayerStatus" AS ENUM ('ACTIVE', 'LEFT', 'KICKED');

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "hostUserId" TEXT,
    "status" "RoomStatus" NOT NULL DEFAULT 'LOBBY',
    "questionCount" INTEGER NOT NULL DEFAULT 10,
    "difficulty" "Difficulty",
    "poolKind" "QuizSessionPoolKind" NOT NULL DEFAULT 'MIXED',
    "topicTagId" TEXT,
    "answerSeconds" INTEGER NOT NULL DEFAULT 15,
    "speedScoring" BOOLEAN NOT NULL DEFAULT true,
    "startedAt" TIMESTAMPTZ(3),
    "finishedAt" TIMESTAMPTZ(3),
    "nextRoomCode" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomPlayer" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "status" "RoomPlayerStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomQuestion" (
    "roomId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "questionId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "correctKey" TEXT NOT NULL,
    "introAt" TIMESTAMPTZ(3) NOT NULL,
    "openAt" TIMESTAMPTZ(3) NOT NULL,
    "closeAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RoomQuestion_pkey" PRIMARY KEY ("roomId","position")
);

-- CreateTable
CREATE TABLE "RoomAnswer" (
    "roomId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "playerId" TEXT NOT NULL,
    "optionKey" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "points" INTEGER NOT NULL,
    "answeredAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RoomAnswer_pkey" PRIMARY KEY ("roomId","position","playerId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Room_code_key" ON "Room"("code");

-- CreateIndex
CREATE INDEX "Room_hostUserId_status_idx" ON "Room"("hostUserId", "status");

-- CreateIndex
CREATE INDEX "RoomPlayer_userId_idx" ON "RoomPlayer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomPlayer_roomId_userId_key" ON "RoomPlayer"("roomId", "userId");

-- CreateIndex
CREATE INDEX "RoomAnswer_playerId_idx" ON "RoomAnswer"("playerId");

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_topicTagId_fkey" FOREIGN KEY ("topicTagId") REFERENCES "Tag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomPlayer" ADD CONSTRAINT "RoomPlayer_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomPlayer" ADD CONSTRAINT "RoomPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomQuestion" ADD CONSTRAINT "RoomQuestion_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomAnswer" ADD CONSTRAINT "RoomAnswer_roomId_position_fkey" FOREIGN KEY ("roomId", "position") REFERENCES "RoomQuestion"("roomId", "position") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomAnswer" ADD CONSTRAINT "RoomAnswer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "RoomPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

