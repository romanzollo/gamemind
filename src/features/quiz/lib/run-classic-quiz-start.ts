/**
 * Общая логика старта Classic (lobby + rematch).
 *
 * Без redirect / FormData — auth/rate limit в actions.
 *
 * Контракт Classic (не смешивать с Timed):
 * - SINGLE: pickClassicSnapshotBundle (один мешок) → create;
 * - MIXED: pickMixedSnapshotBundle (3× cycle + shuffle + 1 resolve) →
 *   createWithJsonSnapshot (poolKind MIXED, difficulty NULL);
 * - pick: cycle write TLS + resolve chunks; create — отдельный budget;
 * - 500ms settle перед pick (rematch / lobby Daily);
 * - матрица: Easy 3 / 5 / 10 и MIXED 3 / 5 / 10 → 303.
 *
 * Canon: docs/DECISIONS.md → Quiz Start / Session Load Playbook.
 */

import { quizSessionRepository } from '@/entities/quiz-session/quiz-session.repository';
import { buildQuizSnapshotQuestions } from '@/features/quiz/lib/build-quiz-snapshot-questions';
import { mapQuizStartError } from '@/features/quiz/lib/map-quiz-start-error';
import { getQuizSessionPoolWrite } from '@/features/quiz/lib/mixed-difficulty-split';
import {
    pickClassicSnapshotBundle,
    pickMixedSnapshotBundle,
} from '@/features/quiz/lib/pick-quiz-snapshot-bundle';
import type { QuizErrorCode, QuizSetupDifficulty } from '@/features/quiz/types';
import type { Locale } from '@/shared/i18n';

const CLASSIC_START_SETTLE_MS = 500;

export type RunClassicQuizStartInput = {
    userId: string;
    difficulty: QuizSetupDifficulty;
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

        const pickedQuestions =
            input.difficulty === 'MIXED'
                ? await pickMixedSnapshotBundle(
                      input.userId,
                      input.questionCount,
                      input.locale,
                  )
                : await pickClassicSnapshotBundle(
                      input.userId,
                      input.difficulty,
                      input.questionCount,
                      input.locale,
                  );

        if (pickedQuestions.length < input.questionCount) {
            return { ok: false, errorCode: 'NOT_ENOUGH_QUESTIONS' };
        }

        const pool = getQuizSessionPoolWrite(input.difficulty);

        const quizSession = await quizSessionRepository.createWithJsonSnapshot({
            userId: input.userId,
            difficulty: pool.difficulty,
            poolKind: pool.poolKind,
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
