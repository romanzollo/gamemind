/**
 * Unit-тесты чистой оценки Achievements.
 *
 * Зачем: фиксируем пороги и флаги без Neon — рефактор каталога не должен
 * случайно выдать QUIZZES_5 при 4 квизах или POINTS_250 при 249 очках.
 */

import { describe, expect, it } from 'vitest';

import type { AchievementEvalFacts } from '@/features/achievements/types';

import {
    evaluateAchievements,
    getNewlyEarnedAchievementCodes,
    isAchievementCriteriaMet,
} from './evaluate-achievements';

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

describe('isAchievementCriteriaMet', () => {
    it('requires quizzesCompleted >= threshold for count criteria', () => {
        expect(
            isAchievementCriteriaMet(
                {
                    code: 'FIRST_QUIZ',
                    criteria: 'quizzes_completed_at_least',
                    threshold: 1,
                },
                facts({ quizzesCompleted: 0 }),
            ),
        ).toBe(false);

        expect(
            isAchievementCriteriaMet(
                {
                    code: 'FIRST_QUIZ',
                    criteria: 'quizzes_completed_at_least',
                    threshold: 1,
                },
                facts({ quizzesCompleted: 1 }),
            ),
        ).toBe(true);
    });

    it('maps once-flags for perfect / daily / medium / hard / timed / accuracy', () => {
        expect(
            isAchievementCriteriaMet(
                {
                    code: 'PERFECT_QUIZ',
                    criteria: 'perfect_quiz_once',
                    threshold: null,
                },
                facts({ hasPerfectQuiz: true }),
            ),
        ).toBe(true);

        expect(
            isAchievementCriteriaMet(
                {
                    code: 'DAILY_COMPLETE',
                    criteria: 'daily_challenge_completed_once',
                    threshold: null,
                },
                facts({ hasDailyCompleted: false }),
            ),
        ).toBe(false);

        expect(
            isAchievementCriteriaMet(
                {
                    code: 'TIMED_COMPLETE',
                    criteria: 'timed_quiz_completed_once',
                    threshold: null,
                },
                facts({ hasTimedCompleted: true }),
            ),
        ).toBe(true);

        expect(
            isAchievementCriteriaMet(
                {
                    code: 'HIGH_ACCURACY_90',
                    criteria: 'high_accuracy_quiz_once',
                    threshold: null,
                },
                facts({ hasHighAccuracy90: true }),
            ),
        ).toBe(true);
    });

    it('requires both classic and timed for CLASSIC_AND_TIMED', () => {
        expect(
            isAchievementCriteriaMet(
                {
                    code: 'CLASSIC_AND_TIMED',
                    criteria: 'classic_and_timed_completed',
                    threshold: null,
                },
                facts({ hasClassicCompleted: true }),
            ),
        ).toBe(false);

        expect(
            isAchievementCriteriaMet(
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
        ).toBe(true);
    });

    it('uses count facts for PERFECT_3 / DAILY_3 / MEDIUM_5 / HARD_3 / POINTS', () => {
        expect(
            isAchievementCriteriaMet(
                {
                    code: 'PERFECT_3',
                    criteria: 'perfect_quiz_at_least',
                    threshold: 3,
                },
                facts({ perfectQuizCount: 2 }),
            ),
        ).toBe(false);

        expect(
            isAchievementCriteriaMet(
                {
                    code: 'POINTS_250',
                    criteria: 'total_score_at_least',
                    threshold: 250,
                },
                facts({ totalScore: 250 }),
            ),
        ).toBe(true);
    });
});

describe('v4: серии, «Молния», Выживание', () => {
    it('unlocks daily streaks by the best streak, not the total count', () => {
        // Три челленджа всего, но не подряд: DAILY_3 да, DAILY_STREAK_3 нет.
        expect(
            evaluateAchievements(
                facts({
                    hasDailyCompleted: true,
                    dailyCompletedCount: 3,
                    dailyBestStreak: 2,
                }),
            ),
        ).toEqual(['DAILY_COMPLETE', 'DAILY_3']);

        expect(
            evaluateAchievements(facts({ dailyBestStreak: 7 })),
        ).toEqual(['DAILY_STREAK_3', 'DAILY_STREAK_7']);

        expect(
            evaluateAchievements(facts({ dailyBestStreak: 29 })),
        ).not.toContain('DAILY_STREAK_30');
        expect(
            evaluateAchievements(facts({ dailyBestStreak: 30 })),
        ).toContain('DAILY_STREAK_30');
    });

    it('maps BLITZ_PERFECT_FAST to its flag only', () => {
        expect(
            evaluateAchievements(facts({ hasBlitzPerfectFast: true })),
        ).toEqual(['BLITZ_PERFECT_FAST']);
    });

    it('unlocks survival waves on the 3 / 5 / 10 ladder', () => {
        expect(evaluateAchievements(facts({ survivalBestWave: 2 }))).toEqual(
            [],
        );
        expect(evaluateAchievements(facts({ survivalBestWave: 3 }))).toEqual([
            'SURVIVAL_WAVE_3',
        ]);
        expect(evaluateAchievements(facts({ survivalBestWave: 9 }))).toEqual([
            'SURVIVAL_WAVE_3',
            'SURVIVAL_WAVE_5',
        ]);
        expect(
            evaluateAchievements(facts({ survivalBestWave: 10 })),
        ).toContain('SURVIVAL_WAVE_10');
    });

    it('unlocks survival runs at 50 and 100 points of one run', () => {
        expect(
            evaluateAchievements(facts({ survivalBestRunScore: 49 })),
        ).toEqual([]);
        expect(
            evaluateAchievements(facts({ survivalBestRunScore: 50 })),
        ).toEqual(['SURVIVAL_RUN_50']);
        expect(
            evaluateAchievements(facts({ survivalBestRunScore: 100 })),
        ).toEqual(['SURVIVAL_RUN_50', 'SURVIVAL_RUN_100']);
    });

    it('keeps survival out of the old count ladders', () => {
        // Забег на 100 очков не открывает «Счётчик на 250» и счётчик игр.
        const codes = evaluateAchievements(
            facts({ survivalBestWave: 10, survivalBestRunScore: 250 }),
        );
        expect(codes).not.toContain('POINTS_250');
        expect(codes).not.toContain('FIRST_QUIZ');
    });
});

describe('evaluateAchievements', () => {
    it('returns no codes for a brand-new player', () => {
        expect(evaluateAchievements(facts())).toEqual([]);
    });

    it('unlocks FIRST_QUIZ at one completed quiz but not QUIZZES_5', () => {
        expect(evaluateAchievements(facts({ quizzesCompleted: 1 }))).toEqual([
            'FIRST_QUIZ',
        ]);
        expect(evaluateAchievements(facts({ quizzesCompleted: 4 }))).toEqual([
            'FIRST_QUIZ',
        ]);
    });

    it('unlocks FIRST_QUIZ and QUIZZES_5 at five completed quizzes', () => {
        expect(evaluateAchievements(facts({ quizzesCompleted: 5 }))).toEqual([
            'FIRST_QUIZ',
            'QUIZZES_5',
        ]);
    });

    it('unlocks QUIZZES_10 only at ten completed quizzes', () => {
        expect(evaluateAchievements(facts({ quizzesCompleted: 9 }))).toEqual([
            'FIRST_QUIZ',
            'QUIZZES_5',
        ]);
        expect(evaluateAchievements(facts({ quizzesCompleted: 10 }))).toEqual([
            'FIRST_QUIZ',
            'QUIZZES_5',
            'QUIZZES_10',
        ]);
    });

    it('unlocks QUIZZES_25 and QUIZZES_50 on the volume ladder', () => {
        expect(evaluateAchievements(facts({ quizzesCompleted: 25 }))).toEqual([
            'FIRST_QUIZ',
            'QUIZZES_5',
            'QUIZZES_10',
            'QUIZZES_25',
        ]);
        expect(evaluateAchievements(facts({ quizzesCompleted: 50 }))).toEqual([
            'FIRST_QUIZ',
            'QUIZZES_5',
            'QUIZZES_10',
            'QUIZZES_25',
            'QUIZZES_50',
        ]);
    });

    it('keeps catalog order when several flag criteria are met', () => {
        expect(
            evaluateAchievements(
                facts({
                    quizzesCompleted: 10,
                    hasPerfectQuiz: true,
                    perfectQuizCount: 1,
                    hasDailyCompleted: true,
                    dailyCompletedCount: 1,
                    hasMediumCompleted: true,
                    mediumCompletedCount: 1,
                    hasHardCompleted: true,
                    hardCompletedCount: 1,
                    hasTimedCompleted: true,
                    hasClassicCompleted: true,
                    hasHighAccuracy90: true,
                    totalScore: 100,
                }),
            ),
        ).toEqual([
            'FIRST_QUIZ',
            'QUIZZES_5',
            'QUIZZES_10',
            'PERFECT_QUIZ',
            'DAILY_COMPLETE',
            'TIMED_COMPLETE',
            'CLASSIC_AND_TIMED',
            'HIGH_ACCURACY_90',
            'MEDIUM_QUIZ',
            'HARD_QUIZ',
        ]);
    });
});

describe('getNewlyEarnedAchievementCodes', () => {
    it('filters out codes already unlocked (array or Set)', () => {
        const earned = evaluateAchievements(facts({ quizzesCompleted: 5 }));

        expect(
            getNewlyEarnedAchievementCodes(earned, ['FIRST_QUIZ']),
        ).toEqual(['QUIZZES_5']);

        expect(
            getNewlyEarnedAchievementCodes(
                earned,
                new Set(['FIRST_QUIZ', 'QUIZZES_5']),
            ),
        ).toEqual([]);
    });
});
