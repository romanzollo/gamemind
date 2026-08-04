-- Compact bilingual review DTO for fast result review reads (option B).
-- Prefer over reviewSnapshot TOAST on the result API hot path.

ALTER TABLE "QuizResult"
ADD COLUMN "reviewPayload" JSONB;
