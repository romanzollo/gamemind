import { describe, expect, it } from 'vitest';

import { buildRatingHref, parseRatingPeriod } from './rating-period-params';
import { formatTimeLeft, formatWeekRange } from './rating-format';

const UNITS = { daysShort: '{n} д', hoursShort: '{n} ч' };
const HOUR = 60 * 60 * 1000;

describe('parseRatingPeriod', () => {
    it('no param is this week', () => {
        expect(parseRatingPeriod({})).toBe('week');
    });

    it('last and all', () => {
        expect(parseRatingPeriod({ period: 'last' })).toBe('lastWeek');
        expect(parseRatingPeriod({ period: 'all' })).toBe('all');
    });

    it('old board links and junk fall back to this week', () => {
        expect(parseRatingPeriod({ period: 'month', mode: 'blitz' })).toBe(
            'week',
        );
        expect(parseRatingPeriod({ period: ['all', 'last'] })).toBe('all');
    });
});

describe('buildRatingHref', () => {
    it('this week has no param', () => {
        expect(buildRatingHref('ru', 'week')).toBe('/ru/leaderboard');
    });

    it('last week and all time', () => {
        expect(buildRatingHref('en', 'lastWeek')).toBe(
            '/en/leaderboard?period=last',
        );
        expect(buildRatingHref('ru', 'all')).toBe('/ru/leaderboard?period=all');
    });
});

describe('formatWeekRange', () => {
    // Понедельник 2 ноября 2026, 00:00 МСК.
    const monday = new Date('2026-11-01T21:00:00.000Z');

    it('same month in Russian', () => {
        expect(formatWeekRange('ru', monday)).toMatch(/^2\s?–\s?8 ноября$/);
    });

    it('two months in Russian', () => {
        const lateOctober = new Date('2026-10-25T21:00:00.000Z');
        expect(formatWeekRange('ru', lateOctober)).toMatch(
            /^26 октября\s?–\s?1 ноября$/,
        );
    });

    it('English', () => {
        expect(formatWeekRange('en', monday)).toMatch(/^November 2\s?–\s?8$/);
    });
});

describe('formatTimeLeft', () => {
    it('days and hours', () => {
        expect(formatTimeLeft(3 * 24 * HOUR + 14.5 * HOUR, UNITS)).toBe(
            '3 д 14 ч',
        );
    });

    it('whole days drop zero hours', () => {
        expect(formatTimeLeft(2 * 24 * HOUR + 10 * 60 * 1000, UNITS)).toBe(
            '2 д',
        );
    });

    it('under a day shows hours, under an hour shows one hour', () => {
        expect(formatTimeLeft(5 * HOUR, UNITS)).toBe('5 ч');
        expect(formatTimeLeft(20 * 60 * 1000, UNITS)).toBe('1 ч');
        expect(formatTimeLeft(-5, UNITS)).toBe('1 ч');
    });
});
