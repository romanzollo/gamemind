/**
 * Общая логика старта Classic (lobby + rematch).
 *
 * Без redirect / FormData — auth/rate limit в actions.
 *
 * Контракт Classic (не смешивать с Timed):
 * - pickClassicSnapshotBundle → createWithJsonSnapshot (без timedEndsAt);
 * - pick: id-pool TLS + resolve TLS; create — третий budget;
 * - 500ms settle перед pick (rematch / lobby Daily);
 * - матрица: Easy 3 / 5 / 10 → 303.
 *
 * Canon: docs/DECISIONS.md → Quiz Start / Session Load Playbook.
 */

import { quizSessionRepository } from '@/entities/quiz-session/quiz-session.repository';
import { buildQuizSnapshotQuestions } from '@/features/quiz/lib/build-quiz-snapshot-questions';
import { mapQuizStartError } from '@/features/quiz/lib/map-quiz-start-error';
import { pickClassicSnapshotBundle } from '@/features/quiz/lib/pick-quiz-snapshot-bundle';
import type { QuizErrorCode } from '@/features/quiz/types';
import type { Locale } from '@/shared/i18n';
import type { Difficulty } from '@/types';

const CLASSIC_START_SETTLE_MS = 500;

export type RunClassicQuizStartInput = {
    userId: string;
    difficulty: Difficulty;
    questionCount: number;
    locale: Locale;
};

export type RunClassicQuizStartResult =
    | { ok: true; sessionId: string }
    | { ok: false; errorCode: QuizErrorCode };

export async function runClassicQuizStart(
    input: RunClassicQuizStartInput,
): Promise<RunClassicQuizStartResult> {
    try {
        await new Promise((resolve) =>
            setTimeout(resolve, CLASSIC_START_SETTLE_MS),
        );

        const pickedQuestions = await pickClassicSnapshotBundle(
            input.difficulty,
            input.questionCount,
            input.locale,
        );

        if (pickedQuestions.length < input.questionCount) {
            return { ok: false, errorCode: 'NOT_ENOUGH_QUESTIONS' };
        }

        const quizSession = await quizSessionRepository.createWithJsonSnapshot({
            userId: input.userId,
            difficulty: input.difficulty,
            questionCount: input.questionCount,
            sessionLocale: input.locale,
            questions: buildQuizSnapshotQuestions(pickedQuestions),
            pickedQuestions,
        });

        return { ok: true, sessionId: quizSession.id };
    } catch (error) {
        const errorCode = mapQuizStartError(error);
        if (errorCode === 'INVALID_SETUP') {
            console.error('Quiz session snapshot create failed:', error);
        } else {
            console.error('Quiz start failed:', errorCode, error);
        }
        return { ok: false, errorCode };
    }
}
