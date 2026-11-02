-- Таксономия контента: домен → измерение (Facet) → метка (Tag) ↔ вопрос.
-- Question.domainId — домен вопроса (пока у всех `games`); category остаётся,
-- пока код её пишет, и уходит отдельной миграцией.
-- Question.contentKey — стабильный ключ контента (draftKey / id сида), одинаковый
-- на dev и prod; заполняет scripts/taxonomy-sync.cjs.
-- Additive: новые таблицы; ADD COLUMN с константным DEFAULT — только метаданные;
-- FK и UNIQUE строятся по ~550 строкам Question. Горячий путь квиза не читает
-- ни одну из новых колонок — порядок «миграция → деплой» безопасен в обе стороны.
-- Canon: docs/DECISIONS.md → Content taxonomy.

-- CreateTable
CREATE TABLE "Domain" (
    "id" TEXT NOT NULL,
    "nameRu" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Domain_pkey" PRIMARY KEY ("id")
);

-- Домен по умолчанию должен существовать до FK от Question.
INSERT INTO "Domain" ("id", "nameRu", "nameEn", "sortOrder")
VALUES ('games', 'Игры', 'Games', 0);

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "contentKey" TEXT,
ADD COLUMN     "domainId" TEXT NOT NULL DEFAULT 'games';

-- CreateTable
CREATE TABLE "Facet" (
    "id" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameRu" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Facet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "facetId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameRu" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionTag" (
    "questionId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionTag_pkey" PRIMARY KEY ("questionId","tagId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Facet_domainId_slug_key" ON "Facet"("domainId", "slug");

-- CreateIndex
CREATE INDEX "Tag_parentId_idx" ON "Tag"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_facetId_slug_key" ON "Tag"("facetId", "slug");

-- CreateIndex
CREATE INDEX "QuestionTag_tagId_questionId_idx" ON "QuestionTag"("tagId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "Question_contentKey_key" ON "Question"("contentKey");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Facet" ADD CONSTRAINT "Facet_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_facetId_fkey" FOREIGN KEY ("facetId") REFERENCES "Facet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Tag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionTag" ADD CONSTRAINT "QuestionTag_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionTag" ADD CONSTRAINT "QuestionTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
