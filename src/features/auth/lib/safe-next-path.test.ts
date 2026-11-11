import { describe, expect, it } from 'vitest';

import { readSafeNextPath } from './safe-next-path';

describe('readSafeNextPath', () => {
    it('keeps a challenge page path', () => {
        expect(readSafeNextPath('/ru/challenge/abcDEF123_-')).toBe('/ru/challenge/abcDEF123_-');
        expect(readSafeNextPath('/en/challenge/abcDEF123_-')).toBe('/en/challenge/abcDEF123_-');
    });

    it('drops anything else, including other hosts', () => {
        expect(readSafeNextPath('//evil.example/ru/challenge/abcDEF123_-')).toBeNull();
        expect(readSafeNextPath('https://evil.example')).toBeNull();
        expect(readSafeNextPath('/ru/profile')).toBeNull();
        expect(readSafeNextPath('/ru/challenge/short')).toBeNull();
        expect(readSafeNextPath('/ru/challenge/abcDEF123_-/x')).toBeNull();
        expect(readSafeNextPath(null)).toBeNull();
    });
});
