/**
 * Тема игры — метка таксономии (`Tag`), у которой есть `playOrder`: эпоха,
 * жанр, семейство платформ. Игрок выбирает её в шторке Классики и Блица;
 * вопросы берутся только с этой меткой или её детьми (Nintendo → Switch).
 *
 * Общие правила для сервера (pick, проверка ввода) и экрана выбора темы:
 * один порог, одна форма id. Список тем — данные (`playTopics` каталога),
 * не код.
 *
 * Canon: docs/DECISIONS.md → Play topics.
 */

import type { Locale } from '@/shared/i18n';
import type { Difficulty, QuizSetupDifficulty } from '@/types';

/** Тема для экрана выбора: где на ней хватает вопросов. */
export type PlayTopicOption = {
    id: string;
    nameRu: string;
    nameEn: string;
    available: Record<Difficulty, boolean>;
};

/** Строка запроса доступности: опубликованные вопросы темы по сложностям. */
export type PlayTopicCountRow = {
    id: string;
    nameRu: string;
    nameEn: string;
    easy: number;
    medium: number;
    hard: number;
};

export function toPlayTopicOptions(
    rows: readonly PlayTopicCountRow[],
): PlayTopicOption[] {
    return rows.map((row) => ({
        id: row.id,
        nameRu: row.nameRu,
        nameEn: row.nameEn,
        available: {
            EASY: row.easy >= PLAY_TOPIC_MIN_QUESTIONS,
            MEDIUM: row.medium >= PLAY_TOPIC_MIN_QUESTIONS,
            HARD: row.hard >= PLAY_TOPIC_MIN_QUESTIONS,
        },
    }));
}

/** Микс берёт куски всех трёх сложностей — тема нужна на каждой. */
export function isPlayTopicAvailable(
    topic: PlayTopicOption,
    difficulty: QuizSetupDifficulty,
): boolean {
    return difficulty === 'MIXED'
        ? topic.available.EASY && topic.available.MEDIUM && topic.available.HARD
        : topic.available[difficulty];
}

/** Название метки на языке интерфейса: колонки `nameRu` / `nameEn`. */
export function getPlayTopicName(
    topic: { nameRu: string; nameEn: string },
    locale: Locale,
): string {
    return locale === 'en' ? topic.nameEn : topic.nameRu;
}

/**
 * Меньше вопросов на сложности — тема на ней недоступна: Блиц и Классика
 * берут до 10, и уже вторая партия собиралась бы из повторов.
 */
export const PLAY_TOPIC_MIN_QUESTIONS = 20;

const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';

/** id метки — `<домен>.<измерение>.<slug>`: `games.era.2010s`. */
const PLAY_TOPIC_ID_PATTERN = new RegExp(`^${SLUG}\\.${SLUG}\\.${SLUG}$`);

/**
 * Форма id темы из формы старта. Что метка действительно тема, проверяет
 * запрос пула (`playOrder IS NOT NULL`) — здесь только отсекаем мусор.
 */
export function isPlayTopicId(value: unknown): value is string {
    return (
        typeof value === 'string' &&
        value.length <= 120 &&
        PLAY_TOPIC_ID_PATTERN.test(value)
    );
}
