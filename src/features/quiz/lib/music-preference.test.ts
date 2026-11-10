import { describe, expect, it } from 'vitest';

import {
    MUSIC_PREFERENCE_COOKIE,
    parseMusicPreference,
    readMusicPreference,
} from './music-preference';

describe('music preference cookie', () => {
    it('only an explicit 0 turns music off', () => {
        expect(parseMusicPreference('0')).toBe(false);
        expect(parseMusicPreference('1')).toBe(true);
        expect(parseMusicPreference(undefined)).toBe(true);
        expect(parseMusicPreference('off')).toBe(true);
        expect(parseMusicPreference('')).toBe(true);
    });

    it('reads its own cookie name', () => {
        const read = (name: string) =>
            name === MUSIC_PREFERENCE_COOKIE ? '0' : undefined;

        expect(MUSIC_PREFERENCE_COOKIE).toBe('gm_music');
        expect(readMusicPreference(read)).toBe(false);
        expect(readMusicPreference(() => undefined)).toBe(true);
    });
});
