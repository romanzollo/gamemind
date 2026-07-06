-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('TEXT', 'IMAGE_GUESS');

-- CreateEnum
CREATE TYPE "QuestionAssetRole" AS ENUM ('PROMPT', 'HINT', 'THUMBNAIL');

-- AlterTable
ALTER TABLE "Question" ADD COLUMN "type" "QuestionType" NOT NULL DEFAULT 'TEXT';

-- AlterTable
ALTER TABLE "QuizSessionQuestion" ADD COLUMN "displayImageUrl" TEXT;

-- CreateTable
CREATE TABLE "QuestionAsset" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "role" "QuestionAssetRole" NOT NULL DEFAULT 'PROMPT',
    "url" TEXT NOT NULL,
    "storageKey" TEXT,
    "mimeType" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "byteSize" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuestionAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuestionAsset_questionId_role_idx" ON "QuestionAsset"("questionId", "role");

-- AddForeignKey
ALTER TABLE "QuestionAsset" ADD CONSTRAINT "QuestionAsset_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
