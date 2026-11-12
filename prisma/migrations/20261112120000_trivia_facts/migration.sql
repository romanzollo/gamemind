-- «А ты знал?» (ROADMAP 5.4a): короткие факты об игре или серии, которые
-- показываются после ответа и в разборе. Факт привязан к метке таксономии
-- (Tag), а не к вопросу. publishedAt NULL — черновик или снят с показа.
-- FK на Tag — RESTRICT: метку с фактами не удалить случайно (--prune).
-- Additive: новая таблица, работающий код её не читает — порядок
-- «миграция → деплой» безопасен.
-- Canon: docs/DECISIONS.md → Did you know: trivia facts.

-- CreateTable
CREATE TABLE "TriviaFact" (
    "id" TEXT NOT NULL,
    "contentKey" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "textRu" TEXT NOT NULL,
    "textEn" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TriviaFact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TriviaFact_contentKey_key" ON "TriviaFact"("contentKey");

-- CreateIndex
CREATE INDEX "TriviaFact_tagId_idx" ON "TriviaFact"("tagId");

-- AddForeignKey
ALTER TABLE "TriviaFact" ADD CONSTRAINT "TriviaFact_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
