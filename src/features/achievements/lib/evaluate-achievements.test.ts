/**
 * Unit-тесты чистой оценки Achievements MVP.
 *
 * Зачем: фиксируем пороги и флаги без Neon — рефактор каталога не должен
 * случайно выдать QUIZZES_5 при 4 квизах или забыть FIRST_QUIZ.
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
        hasDailyCompleted: false,
        hasHardCompleted: false,
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

    it('maps once-flags directly for perfect / daily / hard', () => {
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
                    code: 'HARD_QUIZ',
                    criteria: 'hard_quiz_completed_once',
                    threshold: null,
                },
                facts({ hasHardCompleted: true }),
            ),
        ).toBe(true);
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

    it('keeps catalog order when several flag criteria are met', () => {
        expect(
            evaluateAchievements(
                facts({
                    quizzesCompleted: 5,
                    hasPerfectQuiz: true,
                    hasDailyCompleted: true,
                    hasHardCompleted: true,
                }),
            ),
        ).toEqual([
            'FIRST_QUIZ',
            'QUIZZES_5',
            'PERFECT_QUIZ',
            'DAILY_COMPLETE',
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
            getNewlyEarnedAchievementCodes(earned, new Set(['FIRST_QUIZ', 'QUIZZES_5'])),
        ).toEqual([]);
    });
});
