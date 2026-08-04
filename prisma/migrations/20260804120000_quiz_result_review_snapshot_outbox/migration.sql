-- Result review denormalization + achievement outbox (submit → result incident).
-- reviewSnapshot: result page reads QuizResult only (avoids QuizSession.snapshotData
-- right after COMPLETED UPDATE — observed connect-OK / operation hang on Windows+Neon).
-- AchievementOutbox: durable award intent on the same write hop as complete;
-- processor / profile catch-up are idempotent. No Redis.

ALTER TABLE "QuizResult"
ADD COLUMN "reviewSnapshot" JSONB;

CREATE TABLE "AchievementOutbox" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "AchievementOutbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AchievementOutbox_sessionId_key"
ON "AchievementOutbox"("sessionId");

CREATE INDEX "AchievementOutbox_processedAt_createdAt_idx"
ON "AchievementOutbox"("processedAt", "createdAt");

CREATE INDEX "AchievementOutbox_userId_idx"
ON "AchievementOutbox"("userId");

ALTER TABLE "AchievementOutbox"
ADD CONSTRAINT "AchievementOutbox_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
