/**
 * Unit-тесты детерминированного pick id для Daily Challenge.
 *
 * Зачем: два вызова с одним seed обязаны дать один порядок;
 * другой seed — другой набор; малый пул → [].
 */

import { describe, expect, it } from 'vitest';

import {
    hashStringToSeed,
    pickDailyQuestionIds,
} from './pick-daily-question-ids';

const POOL = [
    'q-zulu',
    'q-alpha',
    'q-mike',
    'q-bravo',
    'q-delta',
    'q-echo',
    'q-foxtrot',
    'q-golf',
    'q-hotel',
    'q-india',
    'q-juliet',
    'q-kilo',
];

describe('hashStringToSeed', () => {
    it('is stable for the same input', () => {
        expect(hashStringToSeed('daily-challenge:2026-07-29')).toBe(
            hashStringToSeed('daily-challenge:2026-07-29'),
        );
    });

    it('changes when the date key changes', () => {
        expect(hashStringToSeed('daily-challenge:2026-07-29')).not.toBe(
            hashStringToSeed('daily-challenge:2026-07-30'),
        );
    });
});

describe('pickDailyQuestionIds', () => {
    it('returns a deterministic ordered subset for the same seed', () => {
        const first = pickDailyQuestionIds(POOL, 10, '2026-07-29');
        const second = pickDailyQuestionIds(POOL, 10, '2026-07-29');

        expect(first).toEqual(second);
        expect(first).toHaveLength(10);
    });

    it('is independent of candidate array order', () => {
        const reversed = [...POOL].reverse();
        const fromOriginal = pickDailyQuestionIds(POOL, 10, '2026-07-29');
        const fromReversed = pickDailyQuestionIds(reversed, 10, '2026-07-29');

        expect(fromOriginal).toEqual(fromReversed);
    });

    it('changes when the seed key changes', () => {
        const dayA = pickDailyQuestionIds(POOL, 10, '2026-07-29');
        const dayB = pickDailyQuestionIds(POOL, 10, '2026-07-30');

        expect(dayA).not.toEqual(dayB);
    });

    it('returns [] when the pool is smaller than count', () => {
        expect(pickDailyQuestionIds(['only-one'], 10, '2026-07-29')).toEqual(
            [],
        );
    });

    it('returns [] when count is zero or negative', () => {
        expect(pickDailyQuestionIds(POOL, 0, '2026-07-29')).toEqual([]);
        expect(pickDailyQuestionIds(POOL, -1, '2026-07-29')).toEqual([]);
    });

    it('only returns ids that exist in the pool', () => {
        const picked = pickDailyQuestionIds(POOL, 10, '2026-07-29');

        for (const id of picked) {
            expect(POOL).toContain(id);
        }
    });
});
