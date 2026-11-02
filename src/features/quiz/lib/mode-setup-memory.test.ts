/**
 * Unit-тесты памяти выбора режима: чтение cookie без Next и браузера.
 */

import { describe, expect, it } from 'vitest';

import {
    DEFAULT_MODE_SETUP,
    MODE_SETUP_COOKIES,
    formatClassicSetup,
    readModeSetupMemory,
} from './mode-setup-memory';

function reader(values: Record<string, string>) {
    return (name: string) => values[name];
}

describe('readModeSetupMemory', () => {
    it('без cookie отдаёт значения по умолчанию', () => {
        expect(readModeSetupMemory(reader({}))).toEqual(DEFAULT_MODE_SETUP);
    });

    it('читает выбор каждого режима и последний режим', () => {
        const memory = readModeSetupMemory(
            reader({
                [MODE_SETUP_COOKIES.lastMode]: 'blitz',
                [MODE_SETUP_COOKIES.classic]: formatClassicSetup({
                    difficulty: 'MIXED',
                    questionCount: 10,
                }),
                [MODE_SETUP_COOKIES.blitz]: 'HARD',
                [MODE_SETUP_COOKIES.survival]: 'EASY',
            }),
        );

        expect(memory).toEqual({
            lastMode: 'blitz',
            classic: { difficulty: 'MIXED', questionCount: 10 },
            blitz: { difficulty: 'HARD' },
            survival: { difficulty: 'EASY' },
        });
    });

    it('мусор и чужие значения заменяет значениями по умолчанию', () => {
        const memory = readModeSetupMemory(
            reader({
                [MODE_SETUP_COOKIES.lastMode]: 'daily',
                [MODE_SETUP_COOKIES.classic]: 'HARD-7',
                [MODE_SETUP_COOKIES.blitz]: 'hard',
                // У Выживания нет смешанной сложности.
                [MODE_SETUP_COOKIES.survival]: 'MIXED',
            }),
        );

        expect(memory).toEqual(DEFAULT_MODE_SETUP);
    });
});
