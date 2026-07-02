-- CreateTable
CREATE TABLE "QuizSessionQuestion" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "QuizSessionQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizSessionQuestionOption" (
    "id" TEXT NOT NULL,
    "sessionQuestionId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,

    CONSTRAINT "QuizSessionQuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuizSessionQuestion_sessionId_idx" ON "QuizSessionQuestion"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuizSessionQuestion_sessionId_questionId_key" ON "QuizSessionQuestion"("sessionId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuizSessionQuestion_sessionId_position_key" ON "QuizSessionQuestion"("sessionId", "position");

-- CreateIndex
CREATE INDEX "QuizSessionQuestionOption_sessionQuestionId_idx" ON "QuizSessionQuestionOption"("sessionQuestionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuizSessionQuestionOption_sessionQuestionId_optionId_key" ON "QuizSessionQuestionOption"("sessionQuestionId", "optionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuizSessionQuestionOption_sessionQuestionId_displayOrder_key" ON "QuizSessionQuestionOption"("sessionQuestionId", "displayOrder");

-- AddForeignKey
ALTER TABLE "QuizSessionQuestion" ADD CONSTRAINT "QuizSessionQuestion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "QuizSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizSessionQuestion" ADD CONSTRAINT "QuizSessionQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizSessionQuestionOption" ADD CONSTRAINT "QuizSessionQuestionOption_sessionQuestionId_fkey" FOREIGN KEY ("sessionQuestionId") REFERENCES "QuizSessionQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizSessionQuestionOption" ADD CONSTRAINT "QuizSessionQuestionOption_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "AnswerOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
