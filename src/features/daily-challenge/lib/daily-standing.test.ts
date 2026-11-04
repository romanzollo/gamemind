import { describe, expect, it } from 'vitest';

import { toDailyStandingView } from './daily-standing';

describe('toDailyStandingView', () => {
    it('counts the share of other players you beat', () => {
        expect(toDailyStandingView({ place: 4, total: 37 })).toEqual({
            place: 4,
            total: 37,
            betterThanPercent: 91,
        });
        expect(toDailyStandingView({ place: 3, total: 5 })?.betterThanPercent).toBe(
            50,
        );
    });

    it('hides the percent below five players', () => {
        expect(toDailyStandingView({ place: 1, total: 2 })).toEqual({
            place: 1,
            total: 2,
            betterThanPercent: null,
        });
        expect(toDailyStandingView({ place: 2, total: 4 })?.betterThanPercent).toBeNull();
    });

    it('hides 100% for the leader and 0% for the last place', () => {
        expect(toDailyStandingView({ place: 1, total: 20 })?.betterThanPercent).toBeNull();
        expect(toDailyStandingView({ place: 20, total: 20 })?.betterThanPercent).toBeNull();
    });

    it('rejects impossible standings', () => {
        expect(toDailyStandingView({ place: 0, total: 3 })).toBeNull();
        expect(toDailyStandingView({ place: 4, total: 3 })).toBeNull();
        expect(toDailyStandingView({ place: 1, total: 0 })).toBeNull();
    });
});
