import { describe, expect, it } from 'vitest';

import {
    countryOf,
    deviceClassOf,
    isBotUserAgent,
    parseBeaconBody,
    toEventRows,
} from './analytics-event-input';

const VISIT = 'a1b2c3d4e5f6a1b2c3d4e5f6';

const CHROME_ANDROID =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const CHROME_DESKTOP =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

describe('parseBeaconBody', () => {
    it('accepts known events and strips unknown props', () => {
        const parsed = parseBeaconBody({
            v: VISIT,
            e: [
                { n: 'mode_open', p: { mode: 'blitz', email: 'x@y.z' } },
                {
                    n: 'visit',
                    p: { route: '/', referrerHost: 't.me', ref: 'share' },
                },
                { n: 'share_click', p: { what: 'result', via: 'button' } },
            ],
        });

        expect(parsed).toEqual({
            visitId: VISIT,
            events: [
                { name: 'mode_open', props: { mode: 'blitz' } },
                {
                    name: 'visit',
                    props: { route: '/', referrerHost: 't.me', ref: 'share' },
                },
                { name: 'share_click', props: { what: 'result', via: 'button' } },
            ],
        });
    });

    it('skips bad events but keeps the good ones', () => {
        const parsed = parseBeaconBody({
            v: VISIT,
            e: [
                { n: 'signup', p: { method: 'password' } },
                { n: 'page_view', p: { route: '/quiz/[id]' } },
                { n: 'mode_open', p: { mode: 'daily' } },
                { n: 'visit', p: { route: '/', referrerHost: 'Evil Host/', ref: null } },
                { n: 'page_view', p: { route: '/leaderboard' } },
            ],
        });

        expect(parsed?.events).toEqual([
            { name: 'page_view', props: { route: '/leaderboard' } },
        ]);
    });

    it('accepts share clicks only with a known target', () => {
        const parsed = parseBeaconBody({
            v: VISIT,
            e: [
                { n: 'share_click', p: { what: 'challenge', via: 'telegram' } },
                { n: 'share_click', p: { what: 'result', via: 'whatsapp' } },
                { n: 'share_click', p: { what: 'profile', via: 'button' } },
            ],
        });

        expect(parsed?.events).toEqual([
            { name: 'share_click', props: { what: 'challenge', via: 'telegram' } },
        ]);
    });

    it('refuses server-only events from the browser', () => {
        const parsed = parseBeaconBody({
            v: VISIT,
            e: [
                { n: 'signup', p: { method: 'password', wasGuest: false } },
                { n: 'guest_merged', p: { method: 'vk' } },
            ],
        });

        expect(parsed?.events).toEqual([]);
    });

    it('rejects a body without a proper visit id or batch', () => {
        expect(parseBeaconBody(null)).toBeNull();
        expect(parseBeaconBody({ v: 'short', e: [{ n: 'share_click', p: { what: 'result', via: 'button' } }] })).toBeNull();
        expect(parseBeaconBody({ v: VISIT, e: [] })).toBeNull();
        expect(
            parseBeaconBody({ v: VISIT, e: Array(21).fill({ n: 'share_click', p: { what: 'result', via: 'button' } }) }),
        ).toBeNull();
    });
});

describe('isBotUserAgent', () => {
    it('lets real browsers through, including in-app ones', () => {
        expect(isBotUserAgent(CHROME_ANDROID)).toBe(false);
        expect(isBotUserAgent(CHROME_DESKTOP)).toBe(false);
        expect(isBotUserAgent(`${CHROME_ANDROID} Telegram-Android/11.2.0`)).toBe(false);
        expect(
            isBotUserAgent(`${CHROME_DESKTOP.replace('Safari', 'YaBrowser/24.10 Safari')}`),
        ).toBe(false);
    });

    it('drops bots, previews, headless browsers and scripts', () => {
        expect(isBotUserAgent(null)).toBe(true);
        expect(isBotUserAgent('')).toBe(true);
        expect(
            isBotUserAgent(
                'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)',
            ),
        ).toBe(true);
        expect(isBotUserAgent('TelegramBot (like TwitterBot)')).toBe(true);
        expect(isBotUserAgent('WhatsApp/2.23.20.0 A')).toBe(true);
        expect(isBotUserAgent('curl/8.4.0')).toBe(true);
        expect(
            isBotUserAgent(CHROME_DESKTOP.replace('Chrome/', 'HeadlessChrome/')),
        ).toBe(true);
        expect(
            isBotUserAgent('Mozilla/5.0 (compatible; vkShare; +http://vk.com/dev/Share)'),
        ).toBe(true);
    });
});

describe('server-side fields', () => {
    it('keeps only a device class and a 2-letter country', () => {
        expect(deviceClassOf(CHROME_ANDROID)).toBe('mobile');
        expect(deviceClassOf(CHROME_DESKTOP)).toBe('desktop');
        expect(deviceClassOf(null)).toBe('desktop');
        expect(countryOf('ru')).toBe('RU');
        expect(countryOf('RUS')).toBeNull();
        expect(countryOf(null)).toBeNull();
    });

    it('builds one row per event with device and country in props', () => {
        const rows = toEventRows({
            beacon: {
                visitId: VISIT,
                events: [{ name: 'mode_open', props: { mode: 'classic' } }],
            },
            userId: 'user-1',
            device: 'mobile',
            country: 'RU',
        });

        expect(rows).toEqual([
            {
                name: 'mode_open',
                visitId: VISIT,
                userId: 'user-1',
                props: { mode: 'classic', device: 'mobile', country: 'RU' },
            },
        ]);
    });
});
