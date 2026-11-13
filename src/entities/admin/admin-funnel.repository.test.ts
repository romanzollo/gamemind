import { describe, expect, it } from 'vitest';

import { buildFunnelReport, isFunnelPeriodDays } from './admin-funnel.repository';

const visitRow = (anonymous: boolean, visits: number) => ({
    anonymous,
    visits,
    demo: 1,
    sheet: 2,
    auth_page: 1,
    started: 1,
    completed: 1,
    shared: 0,
});

describe('buildFunnelReport', () => {
    it('splits GROUPING SETS rows into modes, guests/accounts and the total', () => {
        const report = buildFunnelReport({
            periodDays: 14,
            visits: [visitRow(true, 10), visitRow(false, 4)],
            sources: [{ source: 'direct', visits: 9, gameStarted: 2 }],
            games: [
                { mode: 'classic', is_guest: null, started: 5, answered: 4, completed: 3, players: 3 },
                { mode: 'blitz', is_guest: null, started: 2, answered: 2, completed: 2, players: 1 },
                { mode: null, is_guest: true, started: 3, answered: 2, completed: 1, players: 2 },
                { mode: null, is_guest: false, started: 4, answered: 4, completed: 4, players: 2 },
                { mode: null, is_guest: null, started: 7, answered: 6, completed: 5, players: 4 },
            ],
            replay: { completers: 4, replayed: 1 },
            challenges: { created: 1, accepted: 0 },
            signups: [
                { name: 'signup', method: 'password', was_guest: true, n: 2 },
                { name: 'signup', method: 'vk', was_guest: false, n: 1 },
                { name: 'guest_merged', method: 'yandex', was_guest: null, n: 3 },
            ],
            retention: undefined,
        });

        expect(report.visitsAnonymous.visits).toBe(10);
        expect(report.visitsSignedIn.visits).toBe(4);
        expect(report.gamesByMode.classic).toEqual({ started: 5, answered: 4, completed: 3 });
        expect(report.gamesByMode.survival).toEqual({ started: 0, answered: 0, completed: 0 });
        expect(report.gamesTotal).toEqual({ started: 7, answered: 6, completed: 5 });
        expect(report.players).toEqual({ total: 4, guests: 2, accounts: 2 });
        expect(report.signups).toEqual({
            total: 3,
            fromGuest: 2,
            byMethod: { password: 2, yandex: 0, vk: 1 },
            guestMerged: 3,
        });
        expect(report.retention.newPlayers).toBe(0);
    });

    it('gives an all-zero report on an empty base', () => {
        const report = buildFunnelReport({
            periodDays: 7,
            visits: [],
            sources: [],
            games: [],
            replay: undefined,
            challenges: undefined,
            signups: [],
            retention: undefined,
        });

        expect(report.visitsAnonymous.visits).toBe(0);
        expect(report.players.total).toBe(0);
        expect(report.replay).toEqual({ completers: 0, replayed: 0 });
    });
});

describe('isFunnelPeriodDays', () => {
    it('accepts only the offered periods', () => {
        expect(isFunnelPeriodDays(7)).toBe(true);
        expect(isFunnelPeriodDays(30)).toBe(true);
        expect(isFunnelPeriodDays(90)).toBe(false);
    });
});
