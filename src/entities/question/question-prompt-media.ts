/**
 * Тип вопроса и медиа его промпта — одна точка правды для подбора, снапшота
 * и разбора.
 *
 * Зачем: у IMAGE_GUESS и AUDIO_GUESS промпт — один и тот же PROMPT
 * `QuestionAsset` (запрос подбора отдаёт его URL одной колонкой). В снапшот
 * он попадает под ключом по типу: `imageUrl` у картинки, `audioUrl` у клипа.
 * Так UI картинки никогда не получит URL клипа (сломанный `<img>`), а клип
 * не превратится в картинку.
 *
 * Чистые функции, без БД — можно звать с сервера и из тестов.
 * ADR: docs/DECISIONS.md → Audio questions: AUDIO_GUESS.
 */

import type { QuestionType } from '@/types';

import { normalizeQuizImageUrl } from '@/shared/utils/normalize-quiz-image-url';

/** Строка enum из SQL → доменный тип. Неизвестное значение = TEXT. */
export function toQuestionType(value: string | null | undefined): QuestionType {
    if (value === 'IMAGE_GUESS' || value === 'AUDIO_GUESS') {
        return value;
    }
    return 'TEXT';
}

/** Поля медиа промпта в снапшоте / DTO. */
export type QuestionPromptMediaFields = {
    imageUrl?: string | null;
    audioUrl?: string | null;
};

/**
 * Раскладывает URL PROMPT-ассета по ключу типа.
 * TEXT — без медиа (старые TEXT-вопросы с картинкой остаются картинкой:
 * так было до AUDIO_GUESS, поведение не меняем).
 */
export function promptMediaForType(
    type: QuestionType | undefined,
    promptUrl: string | null | undefined,
): QuestionPromptMediaFields {
    if (type === 'AUDIO_GUESS') {
        const audioUrl = promptUrl?.trim() || null;
        return { imageUrl: null, audioUrl };
    }
    return { imageUrl: normalizeQuizImageUrl(promptUrl) };
}

/** URL клипа только для AUDIO_GUESS; у остальных типов — null. */
export function normalizeQuizAudioUrl(
    type: QuestionType | undefined,
    url: string | null | undefined,
): string | null {
    if (type !== 'AUDIO_GUESS') {
        return null;
    }
    return url?.trim() || null;
}
