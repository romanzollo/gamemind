import { describe, expect, it } from 'vitest';

import { fitWithin } from './prepare-avatar-upload';

describe('fitWithin', () => {
    it('keeps small images as they are', () => {
        expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    });

    it('scales the long side down to the limit and keeps proportions', () => {
        expect(fitWithin(4000, 3000)).toEqual({ width: 1024, height: 768 });
        expect(fitWithin(3000, 4000)).toEqual({ width: 768, height: 1024 });
    });

    it('never returns a zero side', () => {
        expect(fitWithin(10000, 3, 1024)).toEqual({ width: 1024, height: 1 });
    });
});
