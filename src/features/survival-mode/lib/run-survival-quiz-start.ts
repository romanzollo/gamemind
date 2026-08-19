/**
 * Общая логика старта Survival (волна 1).
 *
 * Без redirect / FormData — auth/rate limit в actions.
 *
 * Контракт (не смешивать с Timed и не звать runTimedQuizStart):
 * - pooled abandon + INSERT SurvivalRun до pick;
 * - SINGLE only: pickClassicSnapshotBundle, count = 12 (тот же cycle bag);
 * - Mix нет;
 * - createWithJsonSnapshot: survivalRunId + waveIndex, timedEndsAt omit;
 * - 300ms settle уже внутри pick после cycle; extra 500ms не добавляем;
 * - Daily не ест из этого мешка.
 *
 * Canon: docs/DECISIONS.md → Survival Mode MVP;
 * Quiz Start / Session Load Playbook.
 */

import { quizSessionRepository } from '@/entities/quiz-session/quiz-session.repository';
import { survivalRunRepository } from '@/entities/survival-run/survival-run.repository';
import { buildQuizSnapshotQuestions } from '@/features/quiz/lib/build-quiz-snapshot-questions';
import { mapQuizStartError } from '@/features/quiz/lib/map-quiz-start-error';
import { getQuizSessionPoolWrite } from '@/features/quiz/lib/mixed-difficulty-split';
import { pickClassicSnapshotBundle } from '@/features/quiz/lib/pick-quiz-snapshot-bundle';
import type { QuizErrorCode } from '@/features/quiz/types';
import {
    SURVIVAL_MODE_MVP_RULES,
    type SurvivalDifficulty,
} from '@/features/survival-mode/types';
import type { Locale } from '@/shared/i18n';

export type RunSurvivalQuizStartInput = {
    userId: string;
    difficulty: SurvivalDifficulty;
    locale: Locale;
};

export type RunSurvivalQuizStartResult =
    | { ok: true; sessionId: string }
    | { ok: false; errorCode: QuizErrorCode };

export async function runSurvivalQuizStart(
    input: RunSurvivalQuizStartInput,
): Promise<RunSurvivalQuizStartResult> {
    const { questionCount } = SURVIVAL_MODE_MVP_RULES;

    try {
        const run = await survivalRunRepository.beginSurvivalRunForUser({
            userId: input.userId,
            difficulty: input.difficulty,
        });

        const pickedQuestions = await pickClassicSnapshotBundle(
            input.userId,
            input.difficulty,
            questionCount,
            input.locale,
        );

        if (pickedQuestions.length < questionCount) {
            return { ok: false, errorCode: 'NOT_ENOUGH_QUESTIONS' };
        }

        const pool = getQuizSessionPoolWrite(input.difficulty);

        const quizSession = await quizSessionRepository.createWithJsonSnapshot({
            userId: input.userId,
            difficulty: pool.difficulty,
            poolKind: pool.poolKind,
            questionCount,
            sessionLocale: input.locale,
            survivalRunId: run.runId,
            survivalWaveIndex: run.waveIndex,
            questions: buildQuizSnapshotQuestions(pickedQuestions),
            pickedQuestions,
        });

        return { ok: true, sessionId: quizSession.id };
    } catch (error) {
        const errorCode = mapQuizStartError(error);
        if (errorCode === 'INVALID_SETUP') {
            console.error('Survival quiz session create failed:', error);
        } else {
            console.error('Survival quiz start failed:', errorCode, error);
        }
        return { ok: false, errorCode };
    }
}
