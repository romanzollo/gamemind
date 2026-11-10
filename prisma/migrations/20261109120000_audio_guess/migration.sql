-- Вопросы «угадай по музыке»: новый тип AUDIO_GUESS и пауза часов Блица.
-- QuestionType += AUDIO_GUESS — клип хранится как PROMPT QuestionAsset
-- (mimeType audio/mpeg), отдельной таблицы не нужно.
-- QuizResult.clockCreditMs — сколько миллисекунд «окна прослушивания»
-- засчитал сервер; рекорд Блица по времени вычитает его из длительности.
-- Additive: ADD VALUE в enum не трогает строки; ADD COLUMN с константным
-- DEFAULT в Postgres 11+ — только метаданные. Работающий код новых
-- значений не читает — порядок «миграция → деплой» безопасен.
-- Canon: docs/DECISIONS.md → Audio questions: AUDIO_GUESS.

-- AlterEnum
ALTER TYPE "QuestionType" ADD VALUE IF NOT EXISTS 'AUDIO_GUESS';

-- AlterTable
ALTER TABLE "QuizResult" ADD COLUMN "clockCreditMs" INTEGER NOT NULL DEFAULT 0;
