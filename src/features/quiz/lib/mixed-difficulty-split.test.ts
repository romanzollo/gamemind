/**
 * Unit-тесты фиксированного mix-сплита.
 *
 * Зачем: доли залок продуктом; регресс «Classic 5 = 2/2/1» не должен
 * разъехаться с pick. Pure — без Neon / cycle (docs/TESTING.md Phase B).
 */

import { describe, expect, it } from 'vitest';

import {
    getMixedDifficultySplit,
    getMixedMaxPossibleScore,
    getQuizSessionPoolWrite,
    isMixedQuestionCount,
    listMixedCycleDraws,
} from './mixed-difficulty-split';

describe('isMixedQuestionCount', () => {
    it('accepts Classic/Blitz lengths 3, 5 and 10', () => {
        expect(isMixedQuestionCount(3)).toBe(true);
        expect(isMixedQuestionCount(5)).toBe(true);
        expect(isMixedQuestionCount(10)).toBe(true);
    });

    it('rejects counts that have no locked split', () => {
        expect(isMixedQuestionCount(1)).toBe(false);
        expect(isMixedQuestionCount(4)).toBe(false);
        expect(isMixedQuestionCount(7)).toBe(false);
    });
});

describe('getMixedDifficultySplit', () => {
    it('returns 1+1+1 for Classic 3', () => {
        expect(getMixedDifficultySplit(3)).toEqual({
            EASY: 1,
            MEDIUM: 1,
            HARD: 1,
        });
    });

    it('returns 2+2+1 for Classic 5', () => {
        expect(getMixedDifficultySplit(5)).toEqual({
            EASY: 2,
            MEDIUM: 2,
            HARD: 1,
        });
    });

    it('returns 4+3+3 for Classic/Blitz 10', () => {
        expect(getMixedDifficultySplit(10)).toEqual({
            EASY: 4,
            MEDIUM: 3,
            HARD: 3,
        });
    });

    it('returns null instead of inventing a split', () => {
        expect(getMixedDifficultySplit(7)).toBeNull();
    });

    it('sums to the session length', () => {
        for (const count of [3, 5, 10] as const) {
            const split = getMixedDifficultySplit(count);
            expect(split).not.toBeNull();
            expect(split!.EASY + split!.MEDIUM + split!.HARD).toBe(count);
        }
    });
});

describe('listMixedCycleDraws', () => {
    it('draws EASY then MEDIUM then HARD (not a mixed bag)', () => {
        const draws = listMixedCycleDraws({
            EASY: 4,
            MEDIUM: 3,
            HARD: 3,
        });

        expect(draws.map((draw) => draw.difficulty)).toEqual([
            'EASY',
            'MEDIUM',
            'HARD',
        ]);
        expect(draws.map((draw) => draw.needed)).toEqual([4, 3, 3]);
    });
});

describe('getMixedMaxPossibleScore', () => {
    it('sums locked weights (EASY=1, MEDIUM=2, HARD=3)', () => {
        expect(getMixedMaxPossibleScore(3)).toBe(6);
        expect(getMixedMaxPossibleScore(5)).toBe(9);
        expect(getMixedMaxPossibleScore(10)).toBe(19);
    });

    it('returns null when there is no split', () => {
        expect(getMixedMaxPossibleScore(7)).toBeNull();
    });
});

describe('getQuizSessionPoolWrite', () => {
    it('keeps SINGLE rows on the question Difficulty enum', () => {
        expect(getQuizSessionPoolWrite('HARD')).toEqual({
            poolKind: 'SINGLE',
            difficulty: 'HARD',
        });
    });

    it('writes MIXED with null session difficulty', () => {
        expect(getQuizSessionPoolWrite('MIXED')).toEqual({
            poolKind: 'MIXED',
            difficulty: null,
        });
    });
});
