/**
 * Unit-тесты publish quality gate.
 *
 * Зачем: фиксируем правила «можно / нельзя публиковать» без Neon и без UI.
 * Pure function — идеальный первый suite (см. docs/TESTING.md Phase A).
 */

import { describe, expect, it } from 'vitest';

import {
    getQuestionPublishQualityIssues,
    hasPublishQualityBlockers,
    type QuestionPublishQualityInput,
} from './question-publish-quality';

/**
 * «Здоровый» вопрос без проблем — база для негативных кейсов.
 * В каждом тесте меняем только то поле, которое ломаем.
 */
function makeCleanQuestion(
    overrides: Partial<QuestionPublishQualityInput> = {},
): QuestionPublishQualityInput {
    return {
        type: 'TEXT',
        promptImageUrl: null,
        isActive: true,
        translations: {
            ru: { text: 'Кто создал Mario?' },
            en: { text: 'Who created Mario?' },
        },
        options: [
            {
                isCorrect: true,
                translations: {
                    // RU и EN отличаются — иначе IDENTICAL_OPTION_LOCALES
                    ru: { text: 'Нинтендо' },
                    en: { text: 'Nintendo' },
                },
            },
            {
                isCorrect: false,
                translations: {
                    ru: { text: 'Сега' },
                    en: { text: 'Sega' },
                },
            },
        ],
        ...overrides,
    };
}

describe('getQuestionPublishQualityIssues', () => {
    it('returns no issues for a clean question', () => {
        const input = makeCleanQuestion();

        const issues = getQuestionPublishQualityIssues(input);

        expect(issues).toEqual([]);
    });

    it('returns DUPLICATE_OPTION_TEXT blocker when two options share the same text', () => {
        const input = makeCleanQuestion({
            options: [
                {
                    isCorrect: true,
                    translations: {
                        ru: { text: 'Нинтендо' },
                        en: { text: 'Nintendo' },
                    },
                },
                {
                    isCorrect: false,
                    // Дубликат EN (регистр/пробелы не спасают — normalize внутри)
                    translations: {
                        ru: { text: 'Сега' },
                        en: { text: '  nintendo  ' },
                    },
                },
            ],
        });

        const issues = getQuestionPublishQualityIssues(input);

        expect(issues).toContainEqual({
            code: 'DUPLICATE_OPTION_TEXT',
            severity: 'blocker',
        });
    });

    it('returns IDENTICAL_QUESTION_LOCALES warning when RU and EN question text match', () => {
        const input = makeCleanQuestion({
            translations: {
                ru: { text: 'Who created Mario?' },
                en: { text: 'Who created Mario?' },
            },
        });

        const issues = getQuestionPublishQualityIssues(input);

        expect(issues).toContainEqual({
            code: 'IDENTICAL_QUESTION_LOCALES',
            severity: 'warning',
        });
    });

    it('does not warn when an option is the same Latin name in RU and EN', () => {
        const input = makeCleanQuestion({
            options: [
                {
                    isCorrect: true,
                    translations: {
                        ru: { text: 'Half-Life 2' },
                        en: { text: 'Half-Life 2' },
                    },
                },
                {
                    isCorrect: false,
                    translations: {
                        ru: { text: 'Portal' },
                        en: { text: 'Portal' },
                    },
                },
            ],
        });

        expect(getQuestionPublishQualityIssues(input)).toEqual([]);
    });

    it('warns IDENTICAL_OPTION_LOCALES when EN option is untranslated Cyrillic', () => {
        const input = makeCleanQuestion({
            options: [
                {
                    isCorrect: true,
                    translations: {
                        ru: { text: 'Нинтендо' },
                        en: { text: 'Нинтендо' },
                    },
                },
                {
                    isCorrect: false,
                    translations: {
                        ru: { text: 'Сега' },
                        en: { text: 'Sega' },
                    },
                },
            ],
        });

        expect(getQuestionPublishQualityIssues(input)).toContainEqual({
            code: 'IDENTICAL_OPTION_LOCALES',
            severity: 'warning',
        });
    });

    it('returns MISSING_PROMPT_IMAGE blocker for IMAGE_GUESS without image', () => {
        const input = makeCleanQuestion({
            type: 'IMAGE_GUESS',
            promptImageUrl: null,
        });

        const issues = getQuestionPublishQualityIssues(input);

        expect(issues).toContainEqual({
            code: 'MISSING_PROMPT_IMAGE',
            severity: 'blocker',
        });
    });
});

describe('hasPublishQualityBlockers', () => {
    it('returns true when issues include at least one blocker', () => {
        const issues = getQuestionPublishQualityIssues(
            makeCleanQuestion({
                type: 'IMAGE_GUESS',
                promptImageUrl: null,
            }),
        );

        expect(hasPublishQualityBlockers(issues)).toBe(true);
    });

    it('returns false when there are only warnings (or no issues)', () => {
        const warningOnly = getQuestionPublishQualityIssues(
            makeCleanQuestion({
                translations: {
                    ru: { text: 'Who created Mario?' },
                    en: { text: 'Who created Mario?' },
                },
            }),
        );
        const clean = getQuestionPublishQualityIssues(makeCleanQuestion());

        expect(hasPublishQualityBlockers(warningOnly)).toBe(false);
        expect(hasPublishQualityBlockers(clean)).toBe(false);
    });
});

describe('AUDIO_GUESS', () => {
    const CLIP = '/media/audio/0123456789abcdef.mp3';

    it('blocks publishing without a clip', () => {
        const issues = getQuestionPublishQualityIssues(
            makeCleanQuestion({
                type: 'AUDIO_GUESS',
                promptImageUrl: null,
                audioCredit: { track: 'Main Theme' },
            }),
        );

        expect(issues).toContainEqual({
            code: 'MISSING_PROMPT_AUDIO',
            severity: 'blocker',
        });
        expect(hasPublishQualityBlockers(issues)).toBe(true);
    });

    it('a picture or a foreign path is not a clip', () => {
        for (const url of [
            '/quiz-images/easy/mario.webp',
            'https://example.com/audio/0123456789abcdef.mp3',
        ]) {
            const issues = getQuestionPublishQualityIssues(
                makeCleanQuestion({
                    type: 'AUDIO_GUESS',
                    promptImageUrl: url,
                    audioCredit: { track: 'Main Theme' },
                }),
            );

            expect(issues.map((issue) => issue.code)).toContain(
                'MISSING_PROMPT_AUDIO',
            );
        }
    });

    it('a missing track title is a warning, not a blocker', () => {
        const issues = getQuestionPublishQualityIssues(
            makeCleanQuestion({
                type: 'AUDIO_GUESS',
                promptImageUrl: CLIP,
                audioCredit: { track: '  ' },
            }),
        );

        expect(issues).toEqual([
            { code: 'MISSING_TRACK_CREDIT', severity: 'warning' },
        ]);
        expect(hasPublishQualityBlockers(issues)).toBe(false);
    });

    it('clip and track: nothing to report', () => {
        expect(
            getQuestionPublishQualityIssues(
                makeCleanQuestion({
                    type: 'AUDIO_GUESS',
                    promptImageUrl: CLIP,
                    audioCredit: { track: 'Main Theme' },
                }),
            ),
        ).toEqual([]);
    });
});
