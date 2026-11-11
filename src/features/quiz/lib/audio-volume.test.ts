import { describe, expect, it } from 'vitest';

import {
    DEFAULT_AUDIO_VOLUME,
    effectiveAudioVolume,
    parseAudioVolume,
    toggleAudioMuted,
    withAudioLevel,
} from './audio-volume';

describe('parseAudioVolume', () => {
    it('falls back to the default for empty, broken or foreign values', () => {
        expect(parseAudioVolume(null)).toEqual(DEFAULT_AUDIO_VOLUME);
        expect(parseAudioVolume('{oops')).toEqual(DEFAULT_AUDIO_VOLUME);
        expect(parseAudioVolume('"loud"')).toEqual(DEFAULT_AUDIO_VOLUME);
        expect(parseAudioVolume('{"level":"0.5"}')).toEqual(DEFAULT_AUDIO_VOLUME);
    });

    it('clamps the level and reads muted', () => {
        expect(parseAudioVolume('{"level":1.7}')).toEqual({ level: 1, muted: false });
        expect(parseAudioVolume('{"level":0.42,"muted":true}')).toEqual({
            level: 0.42,
            muted: true,
        });
    });
});

describe('volume transitions', () => {
    it('slider to zero means muted, moving up unmutes', () => {
        expect(withAudioLevel(0)).toEqual({ level: 0, muted: true });
        expect(withAudioLevel(0.3)).toEqual({ level: 0.3, muted: false });
    });

    it('mute keeps the slider position and unmute restores it', () => {
        const muted = toggleAudioMuted({ level: 0.6, muted: false });
        expect(muted).toEqual({ level: 0.6, muted: true });
        expect(effectiveAudioVolume(muted)).toBe(0);
        expect(toggleAudioMuted(muted)).toEqual({ level: 0.6, muted: false });
    });

    it('unmute from a zero slider brings back an audible level', () => {
        expect(toggleAudioMuted({ level: 0, muted: true })).toEqual({
            level: DEFAULT_AUDIO_VOLUME.level,
            muted: false,
        });
    });
});
