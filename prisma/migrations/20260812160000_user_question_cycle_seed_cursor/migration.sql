-- User Question Cycle: replace fat remainingIds JSONB with scalar cursor state.
-- Writing ~100-id JSONB via Prisma on Windows+Neon hung >4s → random fallback + repeats.
-- Seed + cursor + poolSize are tiny UPDATEs; shuffle reconstructed in memory.

ALTER TABLE "UserQuestionCycle"
ADD COLUMN IF NOT EXISTS "cycleSeed" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "UserQuestionCycle"
ADD COLUMN IF NOT EXISTS "cursor" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "UserQuestionCycle"
ADD COLUMN IF NOT EXISTS "poolSize" INTEGER NOT NULL DEFAULT 0;

-- Reset existing bags: next start opens a fresh seeded cycle.
UPDATE "UserQuestionCycle"
SET
    "cycleNumber" = 0,
    "cycleSeed" = 0,
    "cursor" = 0,
    "poolSize" = 0,
    "updatedAt" = NOW();

ALTER TABLE "UserQuestionCycle"
DROP COLUMN IF EXISTS "remainingIds";
