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
