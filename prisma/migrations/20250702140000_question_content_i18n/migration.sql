-- CreateEnum
CREATE TYPE "ContentLocale" AS ENUM ('ru', 'en');

-- AlterTable
ALTER TABLE "QuizSession" ADD COLUMN "sessionLocale" "ContentLocale" NOT NULL DEFAULT 'ru';

-- AlterTable
ALTER TABLE "QuizSessionQuestion" ADD COLUMN "displayText" TEXT;

-- AlterTable
ALTER TABLE "QuizSessionQuestionOption" ADD COLUMN "displayText" TEXT;

-- CreateTable
CREATE TABLE "QuestionTranslation" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "locale" "ContentLocale" NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "QuestionTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnswerOptionTranslation" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "locale" "ContentLocale" NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "AnswerOptionTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuestionTranslation_locale_idx" ON "QuestionTranslation"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionTranslation_questionId_locale_key" ON "QuestionTranslation"("questionId", "locale");

-- CreateIndex
CREATE INDEX "AnswerOptionTranslation_locale_idx" ON "AnswerOptionTranslation"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerOptionTranslation_optionId_locale_key" ON "AnswerOptionTranslation"("optionId", "locale");

-- AddForeignKey
ALTER TABLE "QuestionTranslation" ADD CONSTRAINT "QuestionTranslation_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerOptionTranslation" ADD CONSTRAINT "AnswerOptionTranslation_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "AnswerOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: copy existing monolingual question text into ru translations
INSERT INTO "QuestionTranslation" ("id", "questionId", "locale", "text")
SELECT
    'qt-' || q."id" || '-ru',
    q."id",
    'ru'::"ContentLocale",
    q."text"
FROM "Question" q
ON CONFLICT ("questionId", "locale") DO NOTHING;

-- Backfill: copy existing monolingual option text into ru translations
INSERT INTO "AnswerOptionTranslation" ("id", "optionId", "locale", "text")
SELECT
    'aot-' || ao."id" || '-ru',
    ao."id",
    'ru'::"ContentLocale",
    ao."text"
FROM "AnswerOption" ao
ON CONFLICT ("optionId", "locale") DO NOTHING;
