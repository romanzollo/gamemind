/**
 * Проверки качества вопроса перед publish / submit-for-review.
 *
 * Зачем: publicationStatus уже на prod; следующий ops-шаг — не пускать
 * в квиз-пул сырой контент (пустые тексты, IMAGE без картинки, дубликаты).
 * Pure function: без Prisma / pg / Server Actions — удобно юнит-тестировать
 * и вызывать и с edit-страницы, и из publish action.
 *
 * Severity:
 * - blocker — нельзя публиковать (сломает квиз или нарушает инварианты);
 * - warning — можно, но админ должен увидеть (перевод-копия, inactive и т.п.).
 *
 * См. ROADMAP §7 «Duplicate/quality warnings before publishing»;
 * DECISIONS → Question publication workflow.
 */

import type { QuestionType } from '@/types';

/** Стабильные коды — UI мапит через dictionary, не хардкодит текст. */
export type QuestionPublishQualityCode =
    | 'MISSING_PROMPT_IMAGE'
    | 'NOT_EXACTLY_ONE_CORRECT'
    | 'TOO_FEW_OPTIONS'
    | 'MISSING_QUESTION_TEXT'
    | 'MISSING_OPTION_TEXT'
    | 'DUPLICATE_OPTION_TEXT'
    | 'IDENTICAL_QUESTION_LOCALES'
    | 'IDENTICAL_OPTION_LOCALES'
    | 'INACTIVE_WILL_STAY_HIDDEN';

export type QuestionPublishQualitySeverity = 'blocker' | 'warning';

export type QuestionPublishQualityIssue = {
    code: QuestionPublishQualityCode;
    severity: QuestionPublishQualitySeverity;
};

/**
 * Минимальный снимок для проверок.
 * Совместим с AdminQuestionDetail / AdminQuestionForEdit без лишних полей.
 */
export type QuestionPublishQualityInput = {
    type: QuestionType;
    promptImageUrl: string | null;
    isActive: boolean;
    translations: {
        ru: { text: string };
        en: { text: string };
    };
    options: Array<{
        isCorrect: boolean;
        translations: {
            ru: { text: string };
            en: { text: string };
        };
    }>;
};

function normalizeText(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function hasDuplicateNormalizedTexts(texts: string[]): boolean {
    const seen = new Set<string>();

    for (const text of texts) {
        const key = normalizeText(text);
        if (key.length === 0) {
            continue;
        }
        if (seen.has(key)) {
            return true;
        }
        seen.add(key);
    }

    return false;
}

/**
 * Возвращает список проблем (blockers первыми, затем warnings).
 * Пустой массив = можно публиковать без замечаний.
 */
export function getQuestionPublishQualityIssues(
    input: QuestionPublishQualityInput,
): QuestionPublishQualityIssue[] {
    const issues: QuestionPublishQualityIssue[] = [];

    const questionRu = input.translations.ru.text.trim();
    const questionEn = input.translations.en.text.trim();

    if (questionRu.length === 0 || questionEn.length === 0) {
        issues.push({
            code: 'MISSING_QUESTION_TEXT',
            severity: 'blocker',
        });
    }

    if (input.options.length < 2) {
        issues.push({
            code: 'TOO_FEW_OPTIONS',
            severity: 'blocker',
        });
    }

    const correctCount = input.options.filter(
        (option) => option.isCorrect,
    ).length;
    if (correctCount !== 1) {
        issues.push({
            code: 'NOT_EXACTLY_ONE_CORRECT',
            severity: 'blocker',
        });
    }

    const optionMissingText = input.options.some((option) => {
        const ru = option.translations.ru.text.trim();
        const en = option.translations.en.text.trim();
        return ru.length === 0 || en.length === 0;
    });
    if (optionMissingText) {
        issues.push({
            code: 'MISSING_OPTION_TEXT',
            severity: 'blocker',
        });
    }

    if (
        input.type === 'IMAGE_GUESS' &&
        !input.promptImageUrl?.trim()
    ) {
        issues.push({
            code: 'MISSING_PROMPT_IMAGE',
            severity: 'blocker',
        });
    }

    const ruOptionTexts = input.options.map(
        (option) => option.translations.ru.text,
    );
    const enOptionTexts = input.options.map(
        (option) => option.translations.en.text,
    );
    if (
        hasDuplicateNormalizedTexts(ruOptionTexts) ||
        hasDuplicateNormalizedTexts(enOptionTexts)
    ) {
        issues.push({
            code: 'DUPLICATE_OPTION_TEXT',
            severity: 'blocker',
        });
    }

    // Warnings ниже — не блокируют сами по себе (wiring в следующих шагах).
    if (
        questionRu.length > 0 &&
        questionEn.length > 0 &&
        normalizeText(questionRu) === normalizeText(questionEn)
    ) {
        issues.push({
            code: 'IDENTICAL_QUESTION_LOCALES',
            severity: 'warning',
        });
    }

    const identicalOptionLocales = input.options.some((option) => {
        const ru = option.translations.ru.text.trim();
        const en = option.translations.en.text.trim();
        return (
            ru.length > 0 &&
            en.length > 0 &&
            normalizeText(ru) === normalizeText(en)
        );
    });
    if (identicalOptionLocales) {
        issues.push({
            code: 'IDENTICAL_OPTION_LOCALES',
            severity: 'warning',
        });
    }

    // PUBLISHED + isActive=false не попадает в quiz pool — частая путаница осей.
    if (!input.isActive) {
        issues.push({
            code: 'INACTIVE_WILL_STAY_HIDDEN',
            severity: 'warning',
        });
    }

    return issues;
}

export function hasPublishQualityBlockers(
    issues: QuestionPublishQualityIssue[],
): boolean {
    return issues.some((issue) => issue.severity === 'blocker');
}
