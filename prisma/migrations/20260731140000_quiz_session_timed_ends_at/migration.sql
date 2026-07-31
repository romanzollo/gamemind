-- Timed Mode MVP: server-authoritative deadline on QuizSession.
-- NULL = classic or daily; non-null = timed session (submit must finish by timedEndsAt + grace).
-- Additive nullable column: existing classic/daily INSERT paths omit it → NULL.
-- См. docs/DECISIONS.md → Timed Mode MVP.

ALTER TABLE "QuizSession"
ADD COLUMN "timedEndsAt" TIMESTAMP(3);
