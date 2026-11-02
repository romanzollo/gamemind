/**
 * Последний выбор настроек режима (лобби `/quiz`, шаг 4.2b).
 *
 * Браузер пишет cookie в момент «Начать» в шторке режима; сервер читает её
 * при рендере лобби, чтобы чипы стояли на прошлом выборе, а главная могла
 * предложить «Продолжить» последний режим — без запроса к Neon.
 *
 * Это подсказка, а не источник истины: форма старта по-прежнему проходит
 * Zod в Server Action, а мусор в cookie даёт значения по умолчанию.
 * По cookie на режим — запись одного режима не трогает другие.
 */

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
};

export type ModeSetupMemory = {
    /** Режим последнего старта из шторки; null — ещё не запускали. */
    lastMode: SetupMode | null;
    classic: ClassicSetup;
    blitz: { difficulty: QuizSetupDifficulty };
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
    classic: { difficulty: 'EASY', questionCount: 3 },
    blitz: { difficulty: 'MEDIUM' },
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

/** Формат cookie Классики: `MEDIUM-10`. */
export function formatClassicSetup(setup: ClassicSetup): string {
    return `${setup.difficulty}-${setup.questionCount}`;
}

function parseClassicSetup(value: string | undefined): ClassicSetup | null {
    const [difficultyPart, countPart] = (value ?? '').split('-');
    const difficulty = parseSetupDifficulty(difficultyPart);
    const questionCount = parseClassicQuestionCount(countPart);

    return difficulty && questionCount ? { difficulty, questionCount } : null;
}

/**
 * Собирает память из cookie. `read` — `cookies().get(name)?.value` на сервере;
 * так модуль не зависит от `next/headers` и тестируется без Next.
 */
export function readModeSetupMemory(
    read: (name: string) => string | undefined,
): ModeSetupMemory {
    const blitz = parseSetupDifficulty(read(MODE_SETUP_COOKIES.blitz));
    const survival = parseSurvivalDifficulty(
        read(MODE_SETUP_COOKIES.survival),
    );

    return {
        lastMode: parseSetupMode(read(MODE_SETUP_COOKIES.lastMode)),
        classic:
            parseClassicSetup(read(MODE_SETUP_COOKIES.classic)) ??
            DEFAULT_MODE_SETUP.classic,
        blitz: blitz ? { difficulty: blitz } : DEFAULT_MODE_SETUP.blitz,
        survival: survival
            ? { difficulty: survival }
            : DEFAULT_MODE_SETUP.survival,
    };
}

/**
 * Только браузер: запомнить выбор перед отправкой формы старта.
 * `value` — уже отформатированное значение режима (`formatClassicSetup`
 * или сложность).
 */
export function rememberModeSetup(mode: SetupMode, value: string): void {
    const attributes = `path=/; max-age=${YEAR_SECONDS}; SameSite=Lax`;

    document.cookie = `${MODE_SETUP_COOKIES[mode]}=${value}; ${attributes}`;
    document.cookie = `${MODE_SETUP_COOKIES.lastMode}=${mode}; ${attributes}`;
}
