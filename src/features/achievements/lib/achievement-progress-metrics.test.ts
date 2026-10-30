/**
 * Unit-тесты метрик прогресса к критерию бейджа.
 *
 * Фиксируем: clamp после порога, once = 0|1, classic+timed = 0..2/2, битый threshold → null.
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
        perfectQuizCount: 0,
        hasDailyCompleted: false,
        dailyCompletedCount: 0,
        hasMediumCompleted: false,
        mediumCompletedCount: 0,
        hasHardCompleted: false,
        hardCompletedCount: 0,
        hasTimedCompleted: false,
        hasClassicCompleted: false,
        hasHighAccuracy90: false,
        totalScore: 0,
        dailyBestStreak: 0,
        hasBlitzPerfectFast: false,
        survivalBestWave: 0,
        survivalBestRunScore: 0,
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

    it('maps classic+timed as modes completed out of 2', () => {
        expect(
            getAchievementCriteriaProgress(
                {
                    code: 'CLASSIC_AND_TIMED',
                    criteria: 'classic_and_timed_completed',
                    threshold: null,
                },
                facts({ hasClassicCompleted: true }),
            ),
        ).toEqual({ current: 1, target: 2 });

        expect(
            getAchievementCriteriaProgress(
                {
                    code: 'CLASSIC_AND_TIMED',
                    criteria: 'classic_and_timed_completed',
                    threshold: null,
                },
                facts({
                    hasClassicCompleted: true,
                    hasTimedCompleted: true,
                }),
            ),
        ).toEqual({ current: 2, target: 2 });
    });

    it('maps POINTS_250 from totalScore with clamp', () => {
        expect(
            getAchievementCriteriaProgress(
                {
                    code: 'POINTS_250',
                    criteria: 'total_score_at_least',
                    threshold: 250,
                },
                facts({ totalScore: 180 }),
            ),
        ).toEqual({ current: 180, target: 250 });

        expect(
            getAchievementCriteriaProgress(
                {
                    code: 'POINTS_250',
                    criteria: 'total_score_at_least',
                    threshold: 250,
                },
                facts({ totalScore: 400 }),
            ),
        ).toEqual({ current: 250, target: 250 });
    });

    it('shows best streak, best wave and best run as X / target', () => {
        expect(
            getAchievementCriteriaProgress(
                {
                    code: 'DAILY_STREAK_7',
                    criteria: 'daily_streak_at_least',
                    threshold: 7,
                },
                facts({ dailyBestStreak: 2 }),
            ),
        ).toEqual({ current: 2, target: 7 });

        expect(
            getAchievementCriteriaProgress(
                {
                    code: 'SURVIVAL_WAVE_5',
                    criteria: 'survival_wave_reached_at_least',
                    threshold: 5,
                },
                facts({ survivalBestWave: 12 }),
            ),
        ).toEqual({ current: 5, target: 5 });

        expect(
            getAchievementCriteriaProgress(
                {
                    code: 'SURVIVAL_RUN_100',
                    criteria: 'survival_run_score_at_least',
                    threshold: 100,
                },
                facts({ survivalBestRunScore: 17 }),
            ),
        ).toEqual({ current: 17, target: 100 });
    });

    it('maps BLITZ_PERFECT_FAST as once 0|1', () => {
        expect(
            getAchievementCriteriaProgress(
                {
                    code: 'BLITZ_PERFECT_FAST',
                    criteria: 'blitz_perfect_fast_once',
                    threshold: null,
                },
                facts({ hasBlitzPerfectFast: true }),
            ),
        ).toEqual({ current: 1, target: 1 });
    });
});
