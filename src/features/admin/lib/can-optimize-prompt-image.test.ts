import { describe, expect, it } from 'vitest';

import { canOptimizePromptImage } from './can-optimize-prompt-image';

describe('canOptimizePromptImage', () => {
    it('allows own quiz images and admin uploads', () => {
        expect(canOptimizePromptImage('/quiz-images/hard/8f772562a07a5f43.webp')).toBe(true);
        expect(canOptimizePromptImage('/media/quiz/abc-123.webp')).toBe(true);
    });

    it('skips paths outside the next.config allowlist', () => {
        expect(canOptimizePromptImage('/avatars/x.webp')).toBe(false);
        expect(canOptimizePromptImage('/quiz-images-old/x.webp')).toBe(false);
        expect(canOptimizePromptImage('https://x.public.blob.vercel-storage.com/quiz/a.webp')).toBe(false);
        expect(canOptimizePromptImage('//evil.example/quiz-images/a.webp')).toBe(false);
    });

    it('skips query strings and SVG', () => {
        expect(canOptimizePromptImage('/quiz-images/easy/a.webp?v=2')).toBe(false);
        expect(canOptimizePromptImage('/quiz-images/easy/placeholder.svg')).toBe(false);
        expect(canOptimizePromptImage('/quiz-images/easy/placeholder.SVG')).toBe(false);
    });
});
