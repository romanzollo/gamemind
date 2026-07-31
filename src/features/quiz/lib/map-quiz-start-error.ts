/**
 * Маппинг ошибок quiz start → QuizErrorCode.
 * Pick/snapshot на Neon могут бросить timeout вне узкого try — ловим здесь.
 */

import { QuizSessionStartError } from '@/entities/quiz-session/quiz-session.repository';
import type { QuizErrorCode } from '@/features/quiz/types';
import { isDirectPgTimeoutError } from '@/lib/db/direct-pg';

export function mapQuizStartError(error: unknown): QuizErrorCode {
    if (error instanceof QuizSessionStartError) {
        return error.code;
    }

    if (isDirectPgTimeoutError(error)) {
        return 'DB_TIMEOUT';
    }

    return 'INVALID_SETUP';
}
