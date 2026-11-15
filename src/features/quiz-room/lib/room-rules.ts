/**
 * Правила комнаты (ROADMAP 5.5, ступень 2): лимиты, варианты настроек и
 * длительности фаз. Чистые константы и проверки — общие для сервера и
 * клиента (клиент рисует чипы настроек, сервер проверяет присланное).
 *
 * Canon: docs/DECISIONS.md → Quiz room.
 */

import { z } from 'zod';

import type { Difficulty } from '@/types';

/** Активных игроков в комнате, ведущий включительно (Jackbox держит 8). */
export const ROOM_MAX_PLAYERS = 12;

/** Сколько игроков нужно, чтобы ведущий мог начать. */
export const ROOM_MIN_PLAYERS_TO_START = 2;

export const ROOM_QUESTION_COUNTS = [5, 10, 15, 20] as const;
export const ROOM_ANSWER_SECONDS = [10, 15, 20, 30] as const;

export type RoomQuestionCount = (typeof ROOM_QUESTION_COUNTS)[number];
export type RoomAnswerSeconds = (typeof ROOM_ANSWER_SECONDS)[number];

/** Сложность комнаты: одна из трёх или Микс (равные трети, перемешаны). */
export type RoomDifficulty = Difficulty | 'MIXED';

export const ROOM_DIFFICULTIES: readonly RoomDifficulty[] = [
    'EASY',
    'MEDIUM',
    'HARD',
    'MIXED',
];

export type RoomSettings = {
    questionCount: RoomQuestionCount;
    difficulty: RoomDifficulty;
    /** Тема игры (Tag с playOrder); null — весь банк. */
    topicId: string | null;
    answerSeconds: RoomAnswerSeconds;
    /** false — верный ответ всегда 1000 очков, скорость не важна. */
    speedScoring: boolean;
};

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
    questionCount: 10,
    difficulty: 'MIXED',
    topicId: null,
    answerSeconds: 15,
    speedScoring: true,
};

function oneOf<const T extends readonly number[]>(values: T) {
    return z
        .number()
        .int()
        .refine((value): value is T[number] => values.includes(value));
}

/**
 * Настройки от клиента. Тему сервер дополнительно проверяет в пуле
 * (метка без playOrder даёт пустой пул — как в Play topics).
 */
export const roomSettingsSchema = z.object({
    questionCount: oneOf(ROOM_QUESTION_COUNTS),
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD', 'MIXED']),
    topicId: z.string().min(1).max(64).nullable(),
    answerSeconds: oneOf(ROOM_ANSWER_SECONDS),
    speedScoring: z.boolean(),
});

export function parseRoomSettings(value: unknown): RoomSettings | null {
    const parsed = roomSettingsSchema.safeParse(value);

    return parsed.success ? (parsed.data as RoomSettings) : null;
}

/** Длительности фаз (мс). Вся игра идёт по расписанию от момента старта. */
export const ROOM_TIMING = {
    /**
     * От старта до первого вопроса: «Игра начинается» и отсчёт 3-2-1. 5 с —
     * с запасом на то, что телефон узнаёт о старте со следующим опросом
     * лобби (раз в 1,5 с), и отсчёт всё равно виден целиком.
     */
    countdownMs: 5_000,
    /** Показ вопроса без вариантов: минимум и максимум (зависит от длины текста). */
    introMinMs: 3_000,
    introMaxMs: 6_000,
    /** Сколько знаков текста читается за секунду (оценка для intro). */
    introCharsPerSecond: 25,
    /** Разбор после вопроса: верный ответ, очки, таблица. */
    revealMs: 7_000,
    /** Запас на сеть: ответ, пришедший чуть позже closeAt, ещё принимается. */
    answerGraceMs: 1_500,
    /** Досрочное закрытие: небольшая пауза, чтобы последний ответ «лёг». */
    earlyCloseBufferMs: 600,
    /** Игрок «на связи», если опрашивал состояние не раньше этого. */
    presenceMs: 12_000,
    /** Как часто опрос может обновлять lastSeenAt (меньше записей). */
    presenceWriteEveryMs: 5_000,
    /** Лобби без старта дольше — считается брошенным (код освобождается). */
    lobbyTtlMs: 2 * 60 * 60_000,
} as const;

/** Самый ранний момент ответа без штрафа за скорость (Kahoot: 0.5 с). */
export const ROOM_FULL_POINTS_WINDOW_MS = 500;

export const ROOM_MAX_POINTS = 1000;
