-- Question draft / review / published workflow.
-- isActive остаётся soft-hide; publicationStatus — жизненный цикл контента.
-- Существующие строки → PUBLISHED (не ломаем текущий quiz pool),
-- затем DEFAULT для новых вставок → DRAFT.

CREATE TYPE "QuestionPublicationStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED');

-- Сначала DEFAULT PUBLISHED: все текущие вопросы остаются в pool после миграции.
ALTER TABLE "Question"
ADD COLUMN "publicationStatus" "QuestionPublicationStatus" NOT NULL DEFAULT 'PUBLISHED';

-- Новые INSERT без явного статуса стартуют как черновик.
ALTER TABLE "Question"
ALTER COLUMN "publicationStatus" SET DEFAULT 'DRAFT';

-- Индекс под quiz pick: difficulty + isActive + publicationStatus.
DROP INDEX IF EXISTS "Question_difficulty_isActive_idx";

CREATE INDEX "Question_difficulty_isActive_publicationStatus_idx"
ON "Question"("difficulty", "isActive", "publicationStatus");
