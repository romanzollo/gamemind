/**
 * Unit-тесты поправки клиентских часов (server-clock) без сети: fetch — мок.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadFreshModule() {
    vi.resetModules();
    return import('./server-clock');
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('server clock', () => {
    it('shifts serverNow by the measured offset (device clock 2 s behind)', async () => {
        const fetchMock = vi.fn(async () =>
            Response.json({ now: Date.now() + 2000 }),
        );
        vi.stubGlobal('fetch', fetchMock);
        const clock = await loadFreshModule();

        await clock.syncServerClock();

        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(clock.serverNow() - Date.now()).toBeGreaterThan(1900);
        expect(clock.serverNow() - Date.now()).toBeLessThan(2100);
    });

    it('falls back to the device clock when the server is unreachable', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => {
                throw new Error('offline');
            }),
        );
        const clock = await loadFreshModule();

        await expect(clock.syncServerClock()).resolves.toBeUndefined();
        expect(Math.abs(clock.serverNow() - Date.now())).toBeLessThan(50);
    });

    it('measures once per page load', async () => {
        const fetchMock = vi.fn(async () => Response.json({ now: Date.now() }));
        vi.stubGlobal('fetch', fetchMock);
        const clock = await loadFreshModule();

        await Promise.all([clock.syncServerClock(), clock.syncServerClock()]);

        expect(fetchMock).toHaveBeenCalledTimes(3);
    });
});
