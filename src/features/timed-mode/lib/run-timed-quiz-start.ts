/**
 * Общая логика старта Timed/Blitz (lobby + rematch).
 *
 * Без redirect / FormData — auth/rate limit в actions.
 *
 * Контракт Timed (не смешивать с Classic):
 * - SINGLE: pickTimedSnapshotBundle (тот же мешок, что Classic);
 * - MIXED: pickMixedSnapshotBundle (3× cycle + shuffle + 1 resolve);
 * - createWithJsonSnapshot с timedEndsAt (флаг Timed);
 * - timedEndsAt: Date.now()+duration после connect на create hop
 *   (не SQL NOW() в TIMESTAMP without TZ — node-pg UTC+2 сразу «время вышло»;
 *    не JS now+60 до hop — create TLS съедал минуту);
 *   play-load SELECT-only; refresh не сбрасывает.
 * - abandon orphan timed pooled до pick (не UPDATE+JSONB на Direct create);
 * - 500ms settle перед pick;
 * - матрица: Blitz 10 + Blitz MIXED 10 → 303, countdown ≈60с.
 * - Daily не ест из этого мешка.
 *
 * Canon: docs/DECISIONS.md → Quiz Start / Session Load Playbook.
 */

import { quizSessionRepository } from '@/entities/quiz-session/quiz-session.repository';
import { buildQuizSnapshotQuestions } from '@/features/quiz/lib/build-quiz-snapshot-questions';
import { mapQuizStartError } from '@/features/quiz/lib/map-quiz-start-error';
import { getQuizSessionPoolWrite } from '@/features/quiz/lib/mixed-difficulty-split';
import {
    pickMixedSnapshotBundle,
    pickTimedSnapshotBundle,
} from '@/features/quiz/lib/pick-quiz-snapshot-bundle';
import type { QuizErrorCode, QuizSetupDifficulty } from '@/features/quiz/types';
import { TIMED_MODE_MVP_RULES } from '@/features/timed-mode/types';
import type { Locale } from '@/shared/i18n';

const TIMED_START_SETTLE_MS = 500;

export type RunTimedQuizStartInput = {
    userId: string;
    difficulty: QuizSetupDifficulty;
    locale: Locale;
};

export type RunTimedQuizStartResult =
    | { ok: true; sessionId: string }
    | { ok: false; errorCode: QuizErrorCode };

export async function runTimedQuizStart(
    input: RunTimedQuizStartInput,
): Promise<RunTimedQuizStartResult> {
    const { questionCount } = TIMED_MODE_MVP_RULES;

    try {
        await new Promise((resolve) =>
            setTimeout(resolve, TIMED_START_SETTLE_MS),
        );

        // Scalar abandon до Direct resolve/create. Сбой не блокирует новый старт.
        try {
            await quizSessionRepository.abandonInProgressTimedByUserId(
                input.userId,
            );
        } catch (error) {
            console.warn('Timed abandon skipped:', error);
        }

        const pickedQuestions =
            input.difficulty === 'MIXED'
                ? await pickMixedSnapshotBundle(
                      input.userId,
                      questionCount,
                      input.locale,
                  )
                : await pickTimedSnapshotBundle(
                      input.userId,
                      input.difficulty,
                      questionCount,
                      input.locale,
                  );

        if (pickedQuestions.length < questionCount) {
            return { ok: false, errorCode: 'NOT_ENOUGH_QUESTIONS' };
        }

        // timedEndsAt != null = флаг Timed; дедлайн считает INSERT после connect.
        const timedEndsAt = new Date();
        const pool = getQuizSessionPoolWrite(input.difficulty);

        const quizSession = await quizSessionRepository.createWithJsonSnapshot({
            userId: input.userId,
            difficulty: pool.difficulty,
            poolKind: pool.poolKind,
            questionCount,
            sessionLocale: input.locale,
            timedEndsAt,
            timedDurationSeconds: TIMED_MODE_MVP_RULES.durationSeconds,
            questions: buildQuizSnapshotQuestions(pickedQuestions),
            pickedQuestions,
        });

        return { ok: true, sessionId: quizSession.id };
    } catch (error) {
        const errorCode = mapQuizStartError(error);
        if (errorCode === 'INVALID_SETUP') {
            console.error('Timed quiz session create failed:', error);
        } else {
            console.error('Timed quiz start failed:', errorCode, error);
        }
        return { ok: false, errorCode };
    }
}
