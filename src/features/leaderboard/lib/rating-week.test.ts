import { describe, expect, it } from 'vitest';

import {
    getMoscowWeekStart,
    getNextMoscowWeekStart,
    getRatingPeriodWindow,
} from './rating-week';

// Понедельник 2 ноября 2026, 00:00 МСК = воскресенье 1 ноября, 21:00 UTC.
const MONDAY_MSK = new Date('2026-11-01T21:00:00.000Z');

describe('getMoscowWeekStart', () => {
    it('in the middle of the week returns Monday 00:00 MSK', () => {
        expect(getMoscowWeekStart(new Date('2026-11-05T12:00:00Z'))).toEqual(
            MONDAY_MSK,
        );
    });

    it('Monday 00:00 MSK exactly starts the new week', () => {
        expect(getMoscowWeekStart(MONDAY_MSK)).toEqual(MONDAY_MSK);
    });

    it('Sunday 23:59 MSK still belongs to the previous week', () => {
        const sundayLate = new Date(MONDAY_MSK.getTime() - 60 * 1000);
        expect(getMoscowWeekStart(sundayLate)).toEqual(
            new Date('2026-10-25T21:00:00.000Z'),
        );
    });

    it('UTC Sunday evening after 21:00 is already Monday in Moscow', () => {
        expect(getMoscowWeekStart(new Date('2026-11-01T22:30:00Z'))).toEqual(
            MONDAY_MSK,
        );
    });

    it('crosses a month and a year boundary', () => {
        // Пятница 1 января 2027 МСК → понедельник 28 декабря 2026 МСК.
        expect(getMoscowWeekStart(new Date('2027-01-01T10:00:00Z'))).toEqual(
            new Date('2026-12-27T21:00:00.000Z'),
        );
    });
});

describe('getRatingPeriodWindow', () => {
    const now = new Date('2026-11-05T12:00:00Z');

    it('week: from Monday, open end', () => {
        expect(getRatingPeriodWindow('week', now)).toEqual({
            from: MONDAY_MSK,
            to: null,
        });
    });

    it('lastWeek: previous Monday up to this Monday', () => {
        expect(getRatingPeriodWindow('lastWeek', now)).toEqual({
            from: new Date('2026-10-25T21:00:00.000Z'),
            to: MONDAY_MSK,
        });
    });

    it('all: no bounds', () => {
        expect(getRatingPeriodWindow('all', now)).toEqual({
            from: null,
            to: null,
        });
    });

    it('next reset is the following Monday 00:00 MSK', () => {
        expect(getNextMoscowWeekStart(now)).toEqual(
            new Date('2026-11-08T21:00:00.000Z'),
        );
    });
});
