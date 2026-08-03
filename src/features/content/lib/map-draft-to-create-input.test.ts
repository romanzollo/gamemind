/**
 * Unit-тесты маппера draft → CreateQuestionInput (без Neon).
 */

import { describe, expect, it } from 'vitest';

import { createQuestionSchema } from '@/features/admin/lib/validation';

import type { DraftQuestion } from './draft-questions.schema';
import { mapDraftQuestionToCreateInput } from './map-draft-to-create-input';

function makeDraftQuestion(
    overrides: Partial<DraftQuestion> = {},
): DraftQuestion {
    return {
        draftKey: 'sample-map',
        type: 'TEXT',
        difficulty: 'EASY',
        translations: {
            ru: { text: 'Как зовут брата Марио в тестах?' },
            en: { text: "What is Mario's brother's name in tests?" },
        },
        options: [
            {
                isCorrect: true,
                translations: {
                    ru: { text: 'Луиджи' },
                    en: { text: 'Luigi' },
                },
            },
            {
                isCorrect: false,
                translations: {
                    ru: { text: 'Варио' },
                    en: { text: 'Wario' },
                },
            },
            {
                isCorrect: false,
                translations: {
                    ru: { text: 'Тоад' },
                    en: { text: 'Toad' },
                },
            },
            {
                isCorrect: false,
                translations: {
                    ru: { text: 'Йоши' },
                    en: { text: 'Yoshi' },
                },
            },
        ],
        ...overrides,
    };
}

describe('mapDraftQuestionToCreateInput', () => {
    it('даёт форму, совместимую с createQuestionSchema', () => {
        const mapped = mapDraftQuestionToCreateInput(makeDraftQuestion());
        const parsed = createQuestionSchema.safeParse(mapped);

        expect(parsed.success).toBe(true);
        if (!parsed.success) {
            return;
        }

        expect(parsed.data.type).toBe('TEXT');
        expect(parsed.data.category).toBe('video-games');
        expect(parsed.data.options).toHaveLength(4);
        expect(parsed.data.options.map((option) => option.order)).toEqual([
            0, 1, 2, 3,
        ]);
        expect(parsed.data.options.filter((option) => option.isCorrect)).toHaveLength(
            1,
        );
    });

    it('сохраняет category из draft', () => {
        const mapped = mapDraftQuestionToCreateInput(
            makeDraftQuestion({ category: 'retro' }),
        );

        expect(mapped.category).toBe('retro');
    });
});
