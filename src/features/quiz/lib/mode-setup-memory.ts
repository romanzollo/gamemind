/**
 * Последний выбор настроек режима (шторки на главной, 4.2b–4.2c).
 *
 * Браузер пишет cookie в момент «Начать» в шторке режима; сервер читает её
 * при рендере главной, чтобы чипы стояли на прошлом выборе и блок
 * «Продолжить» предлагал последний режим — без запроса к Neon.
 *
 * Это подсказка, а не источник истины: форма старта по-прежнему проходит
 * Zod в Server Action, а мусор в cookie даёт значения по умолчанию.
 * По cookie на режим — запись одного режима не трогает другие.
 */

import { isPlayTopicId } from '@/entities/play-topic/play-topic';
import {
    MIXED_QUESTION_COUNTS,
    type MixedQuestionCount,
} from '@/features/quiz/lib/mixed-difficulty-split';
import type { QuizSetupDifficulty } from '@/features/quiz/types';
import type { SurvivalDifficulty } from '@/features/survival-mode/types';

export type SetupMode = 'classic' | 'blitz' | 'survival';

export type ClassicSetup = {
    difficulty: QuizSetupDifficulty;
    questionCount: MixedQuestionCount;
    /** Тема игры; null — все вопросы. */
    topic: string | null;
};

export type BlitzSetup = {
    difficulty: QuizSetupDifficulty;
    topic: string | null;
};

export type ModeSetupMemory = {
    /** Режим последнего старта из шторки; null — ещё не запускали. */
    lastMode: SetupMode | null;
    classic: ClassicSetup;
    blitz: BlitzSetup;
    survival: { difficulty: SurvivalDifficulty };
};

export const MODE_SETUP_COOKIES = {
    lastMode: 'gm_last_mode',
    classic: 'gm_setup_classic',
    blitz: 'gm_setup_blitz',
    survival: 'gm_setup_survival',
} as const;

/** Значения до первого старта — те же, что стояли в селектах лобби. */
export const DEFAULT_MODE_SETUP: ModeSetupMemory = {
    lastMode: null,
    classic: { difficulty: 'EASY', questionCount: 3, topic: null },
    blitz: { difficulty: 'MEDIUM', topic: null },
    survival: { difficulty: 'MEDIUM' },
};

const YEAR_SECONDS = 60 * 60 * 24 * 365;

export function parseSetupDifficulty(
    value: string | undefined,
): QuizSetupDifficulty | null {
    return value === 'EASY' ||
        value === 'MEDIUM' ||
        value === 'HARD' ||
        value === 'MIXED'
        ? value
        : null;
}

export function parseSurvivalDifficulty(
    value: string | undefined,
): SurvivalDifficulty | null {
    return value === 'EASY' || value === 'MEDIUM' || value === 'HARD'
        ? value
        : null;
}

export function parseClassicQuestionCount(
    value: string | undefined,
): MixedQuestionCount | null {
    return MIXED_QUESTION_COUNTS.find((count) => String(count) === value) ?? null;
}

function parseSetupMode(value: string | undefined): SetupMode | null {
    return value === 'classic' || value === 'blitz' || value === 'survival'
        ? value
        : null;
}

/**
 * Тема — после двоеточия: в id темы бывает дефис (`action-adventure`),
 * а дефис уже разделяет сложность и число вопросов.
 */
function withTopic(base: string, topic: string | null): string {
    return topic ? `${base}:${topic}` : base;
}

/** Тема из хвоста cookie; мусор — «все вопросы», а не ошибка. */
function splitTopic(value: string | undefined): {
    base: string;
    topic: string | null;
} {
    const raw = value ?? '';
    const colon = raw.indexOf(':');

    if (colon === -1) {
        return { base: raw, topic: null };
    }

    const topic = raw.slice(colon + 1);

    return {
        base: raw.slice(0, colon),
        topic: isPlayTopicId(topic) ? topic : null,
    };
}

/** Формат cookie Классики: `MEDIUM-10` или `MEDIUM-10:games.era.2010s`. */
export function formatClassicSetup(setup: ClassicSetup): string {
    return withTopic(`${setup.difficulty}-${setup.questionCount}`, setup.topic);
}

/** Формат cookie Блица: `MIXED` или `MIXED:games.genre.shooter`. */
export function formatBlitzSetup(setup: BlitzSetup): string {
    return withTopic(setup.difficulty, setup.topic);
}

function parseClassicSetup(value: string | undefined): ClassicSetup | null {
    const { base, topic } = splitTopic(value);
    const [difficultyPart, countPart] = base.split('-');
    const difficulty = parseSetupDifficulty(difficultyPart);
    const questionCount = parseClassicQuestionCount(countPart);

    return difficulty && questionCount
        ? { difficulty, questionCount, topic }
        : null;
}

function parseBlitzSetup(value: string | undefined): BlitzSetup | null {
    const { base, topic } = splitTopic(value);
    const difficulty = parseSetupDifficulty(base);

    return difficulty ? { difficulty, topic } : null;
}

/**
 * Собирает память из cookie. `read` — `cookies().get(name)?.value` на сервере;
 * так модуль не зависит от `next/headers` и тестируется без Next.
 */
export function readModeSetupMemory(
    read: (name: string) => string | undefined,
): ModeSetupMemory {
    const survival = parseSurvivalDifficulty(
        read(MODE_SETUP_COOKIES.survival),
    );

    return {
        lastMode: parseSetupMode(read(MODE_SETUP_COOKIES.lastMode)),
        classic:
            parseClassicSetup(read(MODE_SETUP_COOKIES.classic)) ??
            DEFAULT_MODE_SETUP.classic,
        blitz:
            parseBlitzSetup(read(MODE_SETUP_COOKIES.blitz)) ??
            DEFAULT_MODE_SETUP.blitz,
        survival: survival
            ? { difficulty: survival }
            : DEFAULT_MODE_SETUP.survival,
    };
}

/**
 * Только браузер: запомнить выбор перед отправкой формы старта.
 * `value` — уже отформатированное значение режима (`formatClassicSetup`,
 * `formatBlitzSetup` или сложность Выживания). Значения — латиница, точки,
 * дефисы и двоеточие: экранировать для cookie нечего.
 */
export function rememberModeSetup(mode: SetupMode, value: string): void {
    const attributes = `path=/; max-age=${YEAR_SECONDS}; SameSite=Lax`;

    document.cookie = `${MODE_SETUP_COOKIES[mode]}=${value}; ${attributes}`;
    document.cookie = `${MODE_SETUP_COOKIES.lastMode}=${mode}; ${attributes}`;
}
