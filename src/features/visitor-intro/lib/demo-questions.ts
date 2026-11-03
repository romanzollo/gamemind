/**
 * Демо-вопросы первого экрана посетителя (4.3c): «покажи, а не рассказывай».
 *
 * Это НЕ игровой банк. Ответы лежат в HTML страницы и проверяются в
 * браузере — поэтому здесь только вопросы, которых нет в банке (сверено
 * с dev-БД 3 ноя 2026). Добавляя вопрос сюда, проверь, что его нет в банке
 * и что он не раскрывает ответ на вопрос из банка (ADR «Answer lock-in»).
 * Стандарт — skill gamemind-questions: лёгкий, короткий, один бесспорный
 * ответ, варианты одни и те же на RU и EN. Порядок вариантов — как на
 * экране, верный стоит не первым.
 */

import type { Locale } from '@/shared/i18n';

type LocalizedText = Record<Locale, string>;

type DemoQuestion = {
    id: string;
    text: LocalizedText;
    options: readonly { text: LocalizedText; correct?: true }[];
    /** Откуда факт — для ревью, на экран не идёт. */
    source: string;
};

export type DemoQuestionView = {
    id: string;
    text: string;
    options: { id: string; text: string }[];
    correctOptionId: string;
};

export const DEMO_QUESTIONS: readonly DemoQuestion[] = [
    {
        id: 'mario-peach',
        text: {
            ru: 'Как зовут водопроводчика, который спасает принцессу Пич?',
            en: "What's the name of the plumber who keeps rescuing Princess Peach?",
        },
        options: [
            { text: { ru: 'Луиджи', en: 'Luigi' } },
            { text: { ru: 'Марио', en: 'Mario' }, correct: true },
            { text: { ru: 'Тоад', en: 'Toad' } },
            { text: { ru: 'Варио', en: 'Wario' } },
        ],
        source: 'https://www.nintendo.com/us/character/mario/',
    },
    {
        id: 'witcher3-studio',
        text: {
            ru: 'Какая студия сделала The Witcher 3: Wild Hunt?',
            en: 'Which studio made The Witcher 3: Wild Hunt?',
        },
        options: [
            { text: { ru: 'BioWare', en: 'BioWare' } },
            { text: { ru: 'Bethesda', en: 'Bethesda' } },
            { text: { ru: 'CD Projekt Red', en: 'CD Projekt Red' }, correct: true },
            { text: { ru: 'Ubisoft', en: 'Ubisoft' } },
        ],
        source: 'https://www.thewitcher.com/en/witcher3',
    },
    {
        id: 'zelda-hero',
        text: {
            ru: 'Как зовут героя в зелёной тунике из серии The Legend of Zelda?',
            en: "What's the name of the hero in the green tunic in The Legend of Zelda?",
        },
        options: [
            { text: { ru: 'Зельда', en: 'Zelda' } },
            { text: { ru: 'Ганон', en: 'Ganon' } },
            { text: { ru: 'Эпона', en: 'Epona' } },
            { text: { ru: 'Линк', en: 'Link' }, correct: true },
        ],
        source: 'https://www.zelda.com/',
    },
    {
        id: 'pokemon-pikachu',
        text: {
            ru: 'Как зовут жёлтого электрического покемона — талисман серии Pokémon?',
            en: "What's the name of the yellow Electric-type Pokémon that's the series mascot?",
        },
        options: [
            { text: { ru: 'Псидак', en: 'Psyduck' } },
            { text: { ru: 'Пикачу', en: 'Pikachu' }, correct: true },
            { text: { ru: 'Джигглипафф', en: 'Jigglypuff' } },
            { text: { ru: 'Тогепи', en: 'Togepi' } },
        ],
        source: 'https://www.pokemon.com/us/pokedex/pikachu',
    },
    {
        id: 'fortnite-players',
        text: {
            ru: 'Сколько игроков высаживается на остров в классической «королевской битве» Fortnite?',
            en: 'How many players drop onto the island in a classic Fortnite Battle Royale match?',
        },
        options: [
            { text: { ru: '50', en: '50' } },
            { text: { ru: '64', en: '64' } },
            { text: { ru: '100', en: '100' }, correct: true },
            { text: { ru: '150', en: '150' } },
        ],
        source: 'https://www.fortnite.com/battle-royale',
    },
];

export function toDemoQuestionView(
    question: DemoQuestion,
    locale: Locale,
): DemoQuestionView {
    const options = question.options.map((option, index) => ({
        id: `${question.id}-${index}`,
        text: option.text[locale],
    }));
    const correctIndex = question.options.findIndex((option) => option.correct);

    return {
        id: question.id,
        text: question.text[locale],
        options,
        correctOptionId: options[correctIndex].id,
    };
}

/**
 * С какого вопроса начать: один на всех в течение дня (`YYYY-MM-DD` по
 * Москве) — поисковик и посетитель видят одно и то же, а назавтра — другой.
 */
export function pickDemoStartIndex(dateKey: string, count: number): number {
    const [year, month, day] = dateKey.split('-').map(Number);
    const dayNumber = Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);

    return Number.isFinite(dayNumber) && count > 0
        ? ((dayNumber % count) + count) % count
        : 0;
}
