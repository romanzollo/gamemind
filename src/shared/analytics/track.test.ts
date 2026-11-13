import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    __resetAnalyticsForTests,
    flushAnalytics,
    getOrCreateVisitId,
    optOutOfAnalytics,
    track,
} from './track';

/** Простое хранилище в памяти вместо sessionStorage / localStorage. */
function memoryStorage(): Storage {
    const data = new Map<string, string>();
    return {
        get length() {
            return data.size;
        },
        clear: () => data.clear(),
        getItem: (key) => data.get(key) ?? null,
        key: (index) => [...data.keys()][index] ?? null,
        removeItem: (key) => void data.delete(key),
        setItem: (key, value) => void data.set(key, value),
    };
}

let sent: Blob[];

beforeEach(() => {
    vi.useFakeTimers();
    sent = [];
    vi.stubGlobal('window', {
        sessionStorage: memoryStorage(),
        localStorage: memoryStorage(),
        addEventListener: () => undefined,
    });
    vi.stubGlobal('document', {
        addEventListener: () => undefined,
        visibilityState: 'visible',
    });
    vi.stubGlobal('navigator', {
        sendBeacon: (_url: string, blob: Blob) => {
            sent.push(blob);
            return true;
        },
    });
    __resetAnalyticsForTests();
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

async function sentBodies() {
    const texts = await Promise.all(sent.map((blob) => blob.text()));
    return texts.map((text) => JSON.parse(text));
}

describe('track', () => {
    it('batches events and sends them once after the delay', async () => {
        track({ name: 'mode_open', props: { mode: 'classic' } });
        track({ name: 'share_click', props: {} });
        expect(sent).toHaveLength(0);

        vi.advanceTimersByTime(1_000);
        const bodies = await sentBodies();

        expect(bodies).toHaveLength(1);
        expect(bodies[0].v).toMatch(/^[0-9a-f]{24}$/);
        expect(bodies[0].e).toEqual([
            { n: 'mode_open', p: { mode: 'classic' } },
            { n: 'share_click', p: {} },
        ]);
    });

    it('keeps one visit id per tab', () => {
        const first = getOrCreateVisitId();
        const second = getOrCreateVisitId();
        expect(first.created).toBe(true);
        expect(second).toEqual({ id: first.id, created: false });
    });

    it('sends nothing from an opted-out browser', async () => {
        optOutOfAnalytics();
        track({ name: 'share_click', props: {} });
        vi.advanceTimersByTime(1_000);
        flushAnalytics();
        expect(await sentBodies()).toHaveLength(0);
    });

    it('flushes at once when the batch is full', async () => {
        for (let index = 0; index < 20; index += 1) {
            track({ name: 'share_click', props: {} });
        }
        const bodies = await sentBodies();
        expect(bodies).toHaveLength(1);
        expect(bodies[0].e).toHaveLength(20);
    });
});
