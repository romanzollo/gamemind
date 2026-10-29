/**
 * Маппинг ошибок quiz start → QuizErrorCode.
 * Pick/snapshot на Neon могут бросить timeout вне узкого try — ловим здесь.
 */

import { QuizSessionStartError } from '@/entities/quiz-session/quiz-session.repository';
import type { QuizErrorCode } from '@/features/quiz/types';
import {
    isDirectPgTimeoutError,
    isTransientDirectPgError,
} from '@/lib/db/direct-pg';
import { captureAppError } from '@/lib/monitoring/capture-app-error';

export function mapQuizStartError(error: unknown): QuizErrorCode {
    if (error instanceof QuizSessionStartError) {
        return error.code;
    }

    // Connection terminated / timeout — не маскировать под «проверь сложность».
    if (isDirectPgTimeoutError(error) || isTransientDirectPgError(error)) {
        return 'DB_TIMEOUT';
    }

    return 'INVALID_SETUP';
}

/**
 * Сбой старта → Sentry. Бизнес-отказы (`QuizSessionStartError`: мало
 * вопросов, попытка дня использована) — не ошибка, не шлём.
 * DB_TIMEOUT — warning (Neon-флейк, игрок жмёт ещё раз), прочее — error:
 * игрок не смог начать игру.
 */
export function captureQuizStartError(
    error: unknown,
    errorCode: QuizErrorCode,
    mode: 'classic' | 'timed' | 'survival' | 'daily',
): void {
    if (error instanceof QuizSessionStartError) {
        return;
    }

    captureAppError(error, {
        area: 'quiz-start',
        level: errorCode === 'DB_TIMEOUT' ? 'warning' : 'error',
        extra: { mode, errorCode },
    });
}
