import { describe, expect, it } from 'vitest';

import { updateQuestionSchema } from './validation';

function makeUpdate(overrides: Record<string, unknown>) {
    return {
        questionId: 'q-1',
        type: 'TEXT',
        translations: {
            ru: { text: 'Из какой игры эта музыка?' },
            en: { text: 'Which game is this music from?' },
        },
        difficulty: 'EASY',
        options: [
            {
                id: 'o-1',
                isCorrect: true,
                order: 0,
                translations: { ru: { text: 'Skyrim' }, en: { text: 'Skyrim' } },
            },
            {
                id: 'o-2',
                isCorrect: false,
                order: 1,
                translations: {
                    ru: { text: 'Oblivion' },
                    en: { text: 'Oblivion' },
                },
            },
        ],
        ...overrides,
    };
}

describe('updateQuestionSchema: AUDIO_GUESS', () => {
    it('keeps the type instead of falling back to TEXT', () => {
        const parsed = updateQuestionSchema.safeParse(
            makeUpdate({
                type: 'AUDIO_GUESS',
                promptImageUrl: '/media/audio/0123456789abcdef.mp3',
            }),
        );

        expect(parsed.success && parsed.data.type).toBe('AUDIO_GUESS');
    });

    it('needs our clip path', () => {
        for (const promptImageUrl of [
            '',
            '/quiz-images/easy/skyrim.webp',
            '/media/audio/../quiz/x.mp3',
        ]) {
            expect(
                updateQuestionSchema.safeParse(
                    makeUpdate({ type: 'AUDIO_GUESS', promptImageUrl }),
                ).success,
            ).toBe(false);
        }
    });

    it('accepts uploaded clip metadata without image sizes', () => {
        const parsed = updateQuestionSchema.safeParse(
            makeUpdate({
                type: 'AUDIO_GUESS',
                promptImageUrl: '/media/audio/0123456789abcdef.mp3',
                promptAsset: {
                    storageKey: 'audio/0123456789abcdef.mp3',
                    mimeType: 'audio/mpeg',
                    width: null,
                    height: null,
                    byteSize: 160_000,
                },
                audioCredit: {
                    track: 'Dragonborn',
                    composer: '',
                    performer: '',
                    source: '',
                },
            }),
        );

        expect(parsed.success).toBe(true);
    });
});
