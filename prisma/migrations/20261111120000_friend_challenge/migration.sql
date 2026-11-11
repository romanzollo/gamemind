-- «Вызов другу» (ROADMAP 5.5, этап 1): друг играет те же вопросы, что автор
-- партии Классики, и оба видят сравнение.
-- FriendChallenge — замороженный набор (questionIds) + скопированный результат
-- автора. creatorUserId / sourceSessionId — SET NULL: удалённый аккаунт не
-- ломает чужие попытки. QuizSession.friendChallengeId — попытка вызова;
-- UNIQUE (userId, friendChallengeId) = одна попытка на игрока, как у Daily.
-- Additive: новая таблица, ADD COLUMN без DEFAULT (только метаданные), FK
-- проверяет строки, где колонка сплошь NULL. Работающий код новую колонку не
-- читает — порядок «миграция → деплой» безопасен.
-- Canon: docs/DECISIONS.md → Friend challenge.

-- AlterTable
ALTER TABLE "QuizSession" ADD COLUMN     "friendChallengeId" TEXT;

-- CreateTable
CREATE TABLE "FriendChallenge" (
    "id" TEXT NOT NULL,
    "creatorUserId" TEXT,
    "sourceSessionId" TEXT,
    "difficulty" "Difficulty",
    "poolKind" "QuizSessionPoolKind" NOT NULL,
    "questionCount" INTEGER NOT NULL,
    "questionIds" JSONB NOT NULL,
    "creatorScore" INTEGER NOT NULL,
    "creatorCorrectCount" INTEGER NOT NULL,
    "creatorMarks" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FriendChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FriendChallenge_sourceSessionId_key" ON "FriendChallenge"("sourceSessionId");

-- CreateIndex
CREATE INDEX "FriendChallenge_creatorUserId_idx" ON "FriendChallenge"("creatorUserId");

-- CreateIndex
CREATE INDEX "QuizSession_friendChallengeId_idx" ON "QuizSession"("friendChallengeId");

-- CreateIndex
CREATE UNIQUE INDEX "QuizSession_userId_friendChallengeId_key" ON "QuizSession"("userId", "friendChallengeId");

-- AddForeignKey
ALTER TABLE "FriendChallenge" ADD CONSTRAINT "FriendChallenge_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendChallenge" ADD CONSTRAINT "FriendChallenge_sourceSessionId_fkey" FOREIGN KEY ("sourceSessionId") REFERENCES "QuizSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizSession" ADD CONSTRAINT "QuizSession_friendChallengeId_fkey" FOREIGN KEY ("friendChallengeId") REFERENCES "FriendChallenge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
