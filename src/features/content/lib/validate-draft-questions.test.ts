/**
 * Unit-тесты validate draft JSON (слой контракта + quality preview).
 *
 * Без Neon: читаем sample с диска и ломаем копии в памяти.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { validateDraftQuestionsBatch } from './validate-draft-questions';

function loadSampleBatch(): unknown {
    const raw = readFileSync(
        resolve(process.cwd(), 'content/drafts/examples/sample-text-v1.json'),
        'utf8',
    );
    return JSON.parse(raw) as unknown;
}

function cloneSample(): Record<string, unknown> {
    return structuredClone(loadSampleBatch()) as Record<string, unknown>;
}

describe('validateDraftQuestionsBatch', () => {
    it('принимает sample-text-v1.json (контракт ок)', () => {
        const result = validateDraftQuestionsBatch(loadSampleBatch());

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }

        expect(result.batch.version).toBe(1);
        expect(result.batch.questions).toHaveLength(3);
        // Strategy B titles → IDENTICAL_OPTION_LOCALES warning, не blocker
        expect(result.hasPublishBlockers).toBe(false);
        expect(
            result.qualityReports.some((report) =>
                report.issues.some(
                    (issue) => issue.code === 'IDENTICAL_OPTION_LOCALES',
                ),
            ),
        ).toBe(true);
    });

    it('отклоняет version !== 1', () => {
        const batch = cloneSample();
        batch.version = 2;

        const result = validateDraftQuestionsBatch(batch);

        expect(result.ok).toBe(false);
        if (result.ok) {
            return;
        }

        expect(result.issues.some((issue) => issue.path.includes('version'))).toBe(
            true,
        );
    });

    it('отклоняет не ровно одного correct', () => {
        const batch = cloneSample();
        const questions = batch.questions as Array<{
            options: Array<{ isCorrect: boolean }>;
        }>;
        questions[0].options[0].isCorrect = false;

        const result = validateDraftQuestionsBatch(batch);

        expect(result.ok).toBe(false);
        if (result.ok) {
            return;
        }

        expect(
            result.issues.some((issue) =>
                issue.message.includes('Exactly one correct'),
            ),
        ).toBe(true);
    });

    it('отклоняет дубликат draftKey', () => {
        const batch = cloneSample();
        const questions = batch.questions as Array<{ draftKey?: string }>;
        questions[1].draftKey = questions[0].draftKey;

        const result = validateDraftQuestionsBatch(batch);

        expect(result.ok).toBe(false);
        if (result.ok) {
            return;
        }

        expect(
            result.issues.some((issue) =>
                issue.message.includes('Duplicate draftKey'),
            ),
        ).toBe(true);
    });

    it('контракт ок, но duplicate option text → hasPublishBlockers', () => {
        const batch = cloneSample();
        const questions = batch.questions as Array<{
            options: Array<{
                translations: { ru: { text: string }; en: { text: string } };
            }>;
        }>;
        // Ломаем только RU-дубликат у первого вопроса (Portal)
        questions[0].options[1].translations.ru.text =
            questions[0].options[0].translations.ru.text;

        const result = validateDraftQuestionsBatch(batch);

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }

        expect(result.hasPublishBlockers).toBe(true);
        expect(result.qualityReports[0]?.issues.some(
            (issue) =>
                issue.code === 'DUPLICATE_OPTION_TEXT' &&
                issue.severity === 'blocker',
        )).toBe(true);
    });
});
