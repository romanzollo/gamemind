/**
 * Подписи комнаты из словаря: подстановка `{name}`, ошибки, сложность,
 * строка настроек. Чистые функции — для сервера и клиента.
 */

import type { RoomDifficulty, RoomSettings } from '@/features/quiz-room/lib/room-rules';
import type { RoomErrorCode } from '@/features/quiz-room/types';
import { formatPlural, type Dictionary, type Locale } from '@/shared/i18n';

/** `{name}` → значение; неизвестные метки остаются как есть. */
export function fillRoomText(
    template: string,
    values: Record<string, string | number>,
): string {
    return template.replace(/\{(\w+)\}/g, (match, key: string) =>
        key in values ? String(values[key]) : match,
    );
}

export function roomDifficultyLabel(
    dictionary: Dictionary,
    difficulty: RoomDifficulty,
): string {
    switch (difficulty) {
        case 'EASY':
            return dictionary.quiz.easy;
        case 'MEDIUM':
            return dictionary.quiz.medium;
        case 'HARD':
            return dictionary.quiz.hard;
        case 'MIXED':
            return dictionary.quiz.mixed;
    }
}

export function roomQuestionsLabel(
    dictionary: Dictionary,
    locale: Locale,
    count: number,
): string {
    return formatPlural(locale, count, dictionary.room.questions);
}

/** «10 вопросов · Смешанная · 15 с на ответ» (+ тема, если выбрана). */
export function roomSettingsLine(
    dictionary: Dictionary,
    locale: Locale,
    settings: RoomSettings & { topicName: string | null },
): string {
    const line = fillRoomText(dictionary.room.settingsLine, {
        questions: roomQuestionsLabel(dictionary, locale, settings.questionCount),
        difficulty: roomDifficultyLabel(dictionary, settings.difficulty),
        seconds: settings.answerSeconds,
    });

    return settings.topicName ? `${line} · ${settings.topicName}` : line;
}

export function roomErrorMessage(
    dictionary: Dictionary,
    errorCode: RoomErrorCode | undefined,
): string | undefined {
    const errors = dictionary.room.errors;

    switch (errorCode) {
        case undefined:
            return undefined;
        case 'NOT_FOUND':
            return errors.notFound;
        case 'STARTED':
            return errors.started;
        case 'FULL':
            return errors.full;
        case 'CLOSED':
            return errors.closed;
        case 'KICKED':
            return errors.kicked;
        case 'NOT_ENOUGH_QUESTIONS':
            return errors.notEnoughQuestions;
        case 'NOT_ENOUGH_PLAYERS':
            return dictionary.room.needMorePlayers;
        case 'INVALID':
            return dictionary.room.nicknameInvalid;
        case 'GUEST_HOST':
            return dictionary.room.createNeedsAccount;
        case 'RATE_LIMITED':
            return dictionary.quiz.errors.rateLimited;
        default:
            return errors.generic;
    }
}
