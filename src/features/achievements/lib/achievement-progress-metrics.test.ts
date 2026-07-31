/**
 * Unit-тесты метрик прогресса к критерию бейджа.
 *
 * Фиксируем: clamp после порога, once = 0|1, битый threshold → null.
 */

import { describe, expect, it } from 'vitest';

import type { AchievementEvalFacts } from '@/features/achievements/types';

import { getAchievementCriteriaProgress } from './achievement-progress-metrics';

function facts(
    partial: Partial<AchievementEvalFacts> = {},
): AchievementEvalFacts {
    return {
        quizzesCompleted: 0,
        hasPerfectQuiz: false,
        hasDailyCompleted: false,
        hasMediumCompleted: false,
        hasHardCompleted: false,
        ...partial,
    };
}

describe('getAchievementCriteriaProgress', () => {
    it('maps count criteria to quizzesCompleted / threshold and clamps', () => {
        expect(
            getAchievementCriteriaProgress(
                {
                    code: 'QUIZZES_10',
                    criteria: 'quizzes_completed_at_least',
                    threshold: 10,
                },
                facts({ quizzesCompleted: 7 }),
            ),
        ).toEqual({ current: 7, target: 10 });

        expect(
            getAchievementCriteriaProgress(
                {
                    code: 'QUIZZES_10',
                    criteria: 'quizzes_completed_at_least',
                    threshold: 10,
                },
                facts({ quizzesCompleted: 15 }),
            ),
        ).toEqual({ current: 10, target: 10 });
    });

    it('returns null for invalid count threshold', () => {
        expect(
            getAchievementCriteriaProgress(
                {
                    code: 'QUIZZES_5',
                    criteria: 'quizzes_completed_at_least',
                    threshold: null,
                },
                facts({ quizzesCompleted: 3 }),
            ),
        ).toBeNull();
    });

    it('maps once-flags to 0|1 over target 1', () => {
        expect(
            getAchievementCriteriaProgress(
                {
                    code: 'PERFECT_QUIZ',
                    criteria: 'perfect_quiz_once',
                    threshold: null,
                },
                facts(),
            ),
        ).toEqual({ current: 0, target: 1 });

        expect(
            getAchievementCriteriaProgress(
                {
                    code: 'HARD_QUIZ',
                    criteria: 'hard_quiz_completed_once',
                    threshold: null,
                },
                facts({ hasHardCompleted: true }),
            ),
        ).toEqual({ current: 1, target: 1 });
    });
});
