import { describe, expect, it } from 'vitest';

import { getProfileGameMode } from './map-result-history';

const plain = {
    difficulty: 'EASY' as const,
    isDaily: false,
    isTimed: false,
    isFriendChallenge: false,
    survivalWaveIndex: null,
    topic: null,
};

describe('getProfileGameMode', () => {
    it('reads the mode from session scalars', () => {
        expect(getProfileGameMode(plain)).toBe('classic');
        expect(getProfileGameMode({ ...plain, isDaily: true })).toBe('daily');
        expect(getProfileGameMode({ ...plain, isTimed: true })).toBe('blitz');
        expect(getProfileGameMode({ ...plain, survivalWaveIndex: 2 })).toBe('survival');
        expect(getProfileGameMode({ ...plain, isFriendChallenge: true })).toBe('challenge');
    });

    it('a Survival wave is Survival even though it has a clock', () => {
        expect(getProfileGameMode({ ...plain, isTimed: true, survivalWaveIndex: 1 })).toBe(
            'survival',
        );
    });
});
