import { describe, expect, it } from 'vitest';

import {
    buildUnlockedQuerySuffix,
    isAchievementCode,
    parseUnlockedQuery,
} from '@/features/achievements/lib/parse-unlocked-query';

describe('isAchievementCode', () => {
    it('accepts catalog codes', () => {
        expect(isAchievementCode('FIRST_QUIZ')).toBe(true);
        expect(isAchievementCode('HARD_QUIZ')).toBe(true);
    });

    it('rejects unknown or empty', () => {
        expect(isAchievementCode('FAKE')).toBe(false);
        expect(isAchievementCode('')).toBe(false);
        expect(isAchievementCode('first_quiz')).toBe(false);
    });
});

describe('parseUnlockedQuery', () => {
    it('returns empty for missing or blank', () => {
        expect(parseUnlockedQuery(undefined)).toEqual([]);
        expect(parseUnlockedQuery('')).toEqual([]);
        expect(parseUnlockedQuery('   ')).toEqual([]);
        expect(parseUnlockedQuery([])).toEqual([]);
    });

    it('parses comma-separated known codes', () => {
        expect(parseUnlockedQuery('FIRST_QUIZ,PERFECT_QUIZ')).toEqual([
            'FIRST_QUIZ',
            'PERFECT_QUIZ',
        ]);
    });

    it('drops unknown codes and trims', () => {
        expect(parseUnlockedQuery(' FIRST_QUIZ , FAKE , HARD_QUIZ ')).toEqual([
            'FIRST_QUIZ',
            'HARD_QUIZ',
        ]);
    });

    it('dedupes while keeping first order', () => {
        expect(
            parseUnlockedQuery('QUIZZES_5,FIRST_QUIZ,QUIZZES_5'),
        ).toEqual(['QUIZZES_5', 'FIRST_QUIZ']);
    });

    it('uses first value when searchParam is an array', () => {
        expect(
            parseUnlockedQuery(['DAILY_COMPLETE', 'FIRST_QUIZ']),
        ).toEqual(['DAILY_COMPLETE']);
    });
});

describe('buildUnlockedQuerySuffix', () => {
    it('returns empty string for no codes', () => {
        expect(buildUnlockedQuerySuffix([])).toBe('');
    });

    it('builds unlocked query', () => {
        expect(
            buildUnlockedQuerySuffix(['FIRST_QUIZ', 'HARD_QUIZ']),
        ).toBe('?unlocked=FIRST_QUIZ,HARD_QUIZ');
    });
});
