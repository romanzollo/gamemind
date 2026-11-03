-- Темы игры: выбор «эпоха / жанр / Nintendo» в шторке Классики и Блица.
-- Tag.playOrder — какие метки предлагаются темой и в каком порядке (пишет
-- taxonomy:sync из `playTopics` каталога). QuizSession.topicTagId — тема
-- сессии (NULL = весь банк; сессии с темой не идут в общий рейтинг).
-- UserTopicQuestionCycle — мешок анти-повтора на (игрок, тема, сложность).
-- Отдельная таблица, а не колонка в UserQuestionCycle: смена её UNIQUE
-- сломала бы ON CONFLICT ("userId", "difficulty") работающего кода.
-- Additive: ADD COLUMN без DEFAULT — только метаданные; FK на QuizSession
-- проверяет строки, где topicTagId сплошь NULL. Работающий код новых колонок
-- не читает — порядок «миграция → деплой → taxonomy:sync» безопасен.
-- Canon: docs/DECISIONS.md → Play topics.

-- AlterTable
ALTER TABLE "Tag" ADD COLUMN     "playOrder" INTEGER;

-- AlterTable
ALTER TABLE "QuizSession" ADD COLUMN     "topicTagId" TEXT;

-- CreateTable
CREATE TABLE "UserTopicQuestionCycle" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "cycleNumber" INTEGER NOT NULL DEFAULT 0,
    "cycleSeed" INTEGER NOT NULL DEFAULT 0,
    "cursor" INTEGER NOT NULL DEFAULT 0,
    "poolSize" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTopicQuestionCycle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserTopicQuestionCycle_tagId_idx" ON "UserTopicQuestionCycle"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "UserTopicQuestionCycle_userId_tagId_difficulty_key" ON "UserTopicQuestionCycle"("userId", "tagId", "difficulty");

-- AddForeignKey
ALTER TABLE "QuizSession" ADD CONSTRAINT "QuizSession_topicTagId_fkey" FOREIGN KEY ("topicTagId") REFERENCES "Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTopicQuestionCycle" ADD CONSTRAINT "UserTopicQuestionCycle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTopicQuestionCycle" ADD CONSTRAINT "UserTopicQuestionCycle_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
