import { describe, expect, it } from 'vitest';

import {
    AVATAR_PATTERN_COUNT,
    AVATAR_SHAPES,
    decodeAvatarPattern,
    getAvatarPattern,
} from './avatar-pattern';

describe('getAvatarPattern', () => {
    it('gives the same pattern for the same id', () => {
        const id = 'cm3k9x2ab0000qz8f1y2h3j4k';

        expect(getAvatarPattern(id)).toBe(getAvatarPattern(id));
    });

    it('stays in range and spreads ids over most patterns', () => {
        const seen = new Set<number>();

        for (let index = 0; index < 2000; index += 1) {
            const pattern = getAvatarPattern(`cm${index.toString(36)}user`);

            expect(pattern).toBeGreaterThanOrEqual(0);
            expect(pattern).toBeLessThan(AVATAR_PATTERN_COUNT);
            seen.add(pattern);
        }

        expect(seen.size).toBe(AVATAR_PATTERN_COUNT);
    });
});

describe('decodeAvatarPattern', () => {
    it('covers every tone, shape and rotation exactly once', () => {
        const keys = new Set<string>();

        for (let pattern = 0; pattern < AVATAR_PATTERN_COUNT; pattern += 1) {
            const { tone, shape, rotation } = decodeAvatarPattern(pattern);

            expect(tone).toBeGreaterThanOrEqual(1);
            expect(tone).toBeLessThanOrEqual(6);
            expect(AVATAR_SHAPES).toContain(shape);
            expect([0, 90, 180, 270]).toContain(rotation);
            keys.add(`${tone}-${shape}-${rotation}`);
        }

        expect(keys.size).toBe(AVATAR_PATTERN_COUNT);
    });

    it('folds junk into range instead of throwing', () => {
        expect(decodeAvatarPattern(-1)).toEqual(
            decodeAvatarPattern(AVATAR_PATTERN_COUNT - 1),
        );
        expect(decodeAvatarPattern(Number.NaN)).toEqual(decodeAvatarPattern(0));
    });
});
