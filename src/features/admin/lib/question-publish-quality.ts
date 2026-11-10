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

import { isQuizAudioPublicUrl } from '@/lib/storage/quiz-audio-url';
import type { QuestionType } from '@/types';

/** Стабильные коды — UI мапит через dictionary, не хардкодит текст. */
export type QuestionPublishQualityCode =
    | 'MISSING_PROMPT_IMAGE'
    | 'MISSING_PROMPT_AUDIO'
    | 'NOT_EXACTLY_ONE_CORRECT'
    | 'TOO_FEW_OPTIONS'
    | 'MISSING_QUESTION_TEXT'
    | 'MISSING_OPTION_TEXT'
    | 'DUPLICATE_OPTION_TEXT'
    | 'IDENTICAL_QUESTION_LOCALES'
    | 'IDENTICAL_OPTION_LOCALES'
    | 'INACTIVE_WILL_STAY_HIDDEN'
    | 'MISSING_TRACK_CREDIT';

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
    /** URL PROMPT-ассета: картинка IMAGE_GUESS или клип AUDIO_GUESS. */
    promptImageUrl: string | null;
    /** Подпись трека AUDIO_GUESS (`metadata.track`); для других типов не нужна. */
    audioCredit?: { track: string };
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

/** Есть ли кириллица (включая ё) — признак непереведённого EN. */
const CYRILLIC_PATTERN = /[Ѐ-ӿ]/;

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

    // Без клипа аудиовопрос нельзя сыграть — только наш /media/audio/{hash}.mp3.
    if (
        input.type === 'AUDIO_GUESS' &&
        !isQuizAudioPublicUrl(input.promptImageUrl ?? '')
    ) {
        issues.push({
            code: 'MISSING_PROMPT_AUDIO',
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

    // Варианты — чаще всего названия игр/студий, они законно одинаковы
    // в RU и EN («Half-Life» / «Half-Life»). Тревога только когда в EN
    // осталась кириллица: русский текст скопировали и не перевели.
    const identicalOptionLocales = input.options.some((option) => {
        const ru = option.translations.ru.text.trim();
        const en = option.translations.en.text.trim();
        return (
            ru.length > 0 &&
            en.length > 0 &&
            CYRILLIC_PATTERN.test(en) &&
            normalizeText(ru) === normalizeText(en)
        );
    });
    if (identicalOptionLocales) {
        issues.push({
            code: 'IDENTICAL_OPTION_LOCALES',
            severity: 'warning',
        });
    }

    // Без названия трека в разборе не будет подписи «трек — композитор — игра».
    if (input.type === 'AUDIO_GUESS' && !input.audioCredit?.track.trim()) {
        issues.push({
            code: 'MISSING_TRACK_CREDIT',
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
