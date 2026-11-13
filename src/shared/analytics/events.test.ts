import { describe, expect, it } from 'vitest';

import { referrerHostOf, sanitizeRef, toAnalyticsRoute } from './events';

describe('toAnalyticsRoute', () => {
    it('maps locale pages to route templates', () => {
        expect(toAnalyticsRoute('/ru')).toBe('/');
        expect(toAnalyticsRoute('/en/')).toBe('/');
        expect(toAnalyticsRoute('/ru/login')).toBe('/login');
        expect(toAnalyticsRoute('/en/leaderboard')).toBe('/leaderboard');
        expect(toAnalyticsRoute('/ru/challenge/abc123')).toBe('/challenge/[id]');
        expect(toAnalyticsRoute('/ru/result/cm123')).toBe('/result/[id]');
    });

    it('never counts the play page, admin or unknown paths', () => {
        expect(toAnalyticsRoute('/ru/quiz/cm123')).toBeNull();
        expect(toAnalyticsRoute('/ru/quiz')).toBeNull();
        expect(toAnalyticsRoute('/ru/admin')).toBeNull();
        expect(toAnalyticsRoute('/ru/admin/users')).toBeNull();
        expect(toAnalyticsRoute('/ru/challenge')).toBeNull();
        expect(toAnalyticsRoute('/ru/result/a/b')).toBeNull();
        expect(toAnalyticsRoute('/ru/login/extra')).toBeNull();
        expect(toAnalyticsRoute('/ru/whatever')).toBeNull();
    });
});

describe('sanitizeRef', () => {
    it('keeps a short lowercase token', () => {
        expect(sanitizeRef('share')).toBe('share');
        expect(sanitizeRef(' Telegram_Channel ')).toBe('telegram_channel');
    });

    it('drops junk and caps the length', () => {
        expect(sanitizeRef('<script>')).toBe('script');
        expect(sanitizeRef('a'.repeat(50))).toHaveLength(32);
        expect(sanitizeRef('!!!')).toBeNull();
        expect(sanitizeRef(null)).toBeNull();
        expect(sanitizeRef('')).toBeNull();
    });
});

describe('referrerHostOf', () => {
    it('keeps only the host, without www', () => {
        expect(
            referrerHostOf('https://www.yandex.ru/search/?text=квиз', 'www.game-mind.ru'),
        ).toBe('yandex.ru');
        expect(referrerHostOf('https://t.me/somechannel/12', 'www.game-mind.ru')).toBe(
            't.me',
        );
    });

    it('treats our own site, empty and broken referrers as none', () => {
        expect(
            referrerHostOf('https://www.game-mind.ru/ru/login', 'www.game-mind.ru'),
        ).toBeNull();
        expect(referrerHostOf('https://game-mind.ru/ru', 'www.game-mind.ru')).toBeNull();
        expect(referrerHostOf('', 'www.game-mind.ru')).toBeNull();
        expect(referrerHostOf('not a url', 'www.game-mind.ru')).toBeNull();
    });
});
