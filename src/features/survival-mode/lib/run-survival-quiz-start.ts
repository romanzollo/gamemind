/**
 * Общая логика старта Survival (волна 1 или continue того же run).
 *
 * Без redirect / FormData — auth/rate limit в actions.
 *
 * Контракт (не смешивать с Timed / не звать runTimedQuizStart):
 * - new: pooled abandon + INSERT SurvivalRun; exclude=[]
 * - continue: pooled continue (не kill runId); exclude=seen(run); T0'=bank
 * - pick: pickSurvivalSnapshotBundle (не Classic cycle)
 * - createWithJsonSnapshot: survivalRunId + waveIndex, timedEndsAt omit;
 *   JSONB create pooled. Classic/Blitz create остаются Direct.
 *
 * Canon: docs/DECISIONS.md → Survival Mode MVP;
 * Quiz Start / Session Load Playbook.
 */

import { quizSessionRepository } from '@/entities/quiz-session/quiz-session.repository';
import { survivalRunRepository } from '@/entities/survival-run/survival-run.repository';
import { buildQuizSnapshotQuestions } from '@/features/quiz/lib/build-quiz-snapshot-questions';
import { mapQuizStartError } from '@/features/quiz/lib/map-quiz-start-error';
import { getQuizSessionPoolWrite } from '@/features/quiz/lib/mixed-difficulty-split';
import type { QuizErrorCode } from '@/features/quiz/types';
import { pickSurvivalSnapshotBundle } from '@/features/survival-mode/lib/pick-survival-snapshot-bundle';
import {
    resolveSurvivalWaveQuestionCount,
    SURVIVAL_MODE_MVP_RULES,
    type SurvivalDifficulty,
} from '@/features/survival-mode/types';
import type { Locale } from '@/shared/i18n';

export type RunSurvivalQuizStartInput = {
    userId: string;
    difficulty: SurvivalDifficulty;
    locale: Locale;
    /**
     * Continue того же SurvivalRun. Omit/null = новый забег (T0=20, abandon all).
     */
    continueRunId?: string | null;
};

export type RunSurvivalQuizStartResult =
    | { ok: true; sessionId: string }
    | { ok: false; errorCode: QuizErrorCode };

export async function runSurvivalQuizStart(
    input: RunSurvivalQuizStartInput,
): Promise<RunSurvivalQuizStartResult> {
    try {
        const continueRunId =
            typeof input.continueRunId === 'string' &&
            input.continueRunId.length > 0
                ? input.continueRunId
                : null;

        if (continueRunId) {
            const continued =
                await survivalRunRepository.continueSurvivalRunForUser({
                    userId: input.userId,
                    runId: continueRunId,
                });

            if (!continued.ok) {
                return { ok: false, errorCode: 'INVALID_SETUP' };
            }

            if (continued.difficulty !== input.difficulty) {
                return { ok: false, errorCode: 'INVALID_SETUP' };
            }

            const pickedQuestions = await pickSurvivalSnapshotBundle({
                difficulty: continued.difficulty,
                questionCount: continued.questionCount,
                locale: input.locale,
                excludeQuestionIds: continued.seenQuestionIds,
            });

            if (pickedQuestions.length < continued.questionCount) {
                return { ok: false, errorCode: 'NOT_ENOUGH_QUESTIONS' };
            }

            const pool = getQuizSessionPoolWrite(continued.difficulty);
            const quizSession =
                await quizSessionRepository.createWithJsonSnapshot({
                    userId: input.userId,
                    difficulty: pool.difficulty,
                    poolKind: pool.poolKind,
                    questionCount: continued.questionCount,
                    sessionLocale: input.locale,
                    survivalRunId: continued.runId,
                    survivalWaveIndex: continued.waveIndex,
                    survivalInitialBankSeconds: continued.initialBankSeconds,
                    questions: buildQuizSnapshotQuestions(pickedQuestions),
                    pickedQuestions,
                });

            return { ok: true, sessionId: quizSession.id };
        }

        const run = await survivalRunRepository.beginSurvivalRunForUser({
            userId: input.userId,
            difficulty: input.difficulty,
        });

        const fullWaveSize = SURVIVAL_MODE_MVP_RULES.questionCount;
        const pickedQuestions = await pickSurvivalSnapshotBundle({
            difficulty: input.difficulty,
            questionCount: fullWaveSize,
            locale: input.locale,
            excludeQuestionIds: run.seenQuestionIds,
        });

        // Волна 1: если пул 1..11 — короткая волна, чтобы выжать максимум.
        const available = pickedQuestions.length;
        const questionCount = resolveSurvivalWaveQuestionCount(
            available,
            fullWaveSize,
        );

        if (questionCount <= 0 || available < questionCount) {
            return { ok: false, errorCode: 'NOT_ENOUGH_QUESTIONS' };
        }

        const waveQuestions = pickedQuestions.slice(0, questionCount);
        const pool = getQuizSessionPoolWrite(input.difficulty);

        const quizSession = await quizSessionRepository.createWithJsonSnapshot({
            userId: input.userId,
            difficulty: pool.difficulty,
            poolKind: pool.poolKind,
            questionCount,
            sessionLocale: input.locale,
            survivalRunId: run.runId,
            survivalWaveIndex: run.waveIndex,
            survivalInitialBankSeconds: run.initialBankSeconds,
            questions: buildQuizSnapshotQuestions(waveQuestions),
            pickedQuestions: waveQuestions,
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
