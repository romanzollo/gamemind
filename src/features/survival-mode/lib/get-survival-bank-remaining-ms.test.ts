/**
 * Unit-тесты клиентского remaining Survival-банка.
 *
 * Зачем: lock-in UX должен совпадать с budget на submit, но без grace
 * (клиент замирает на 0; сервер даёт 3с на complete в Chat E).
 * Pure — без Neon.
 */

import { describe, expect, it } from 'vitest';

import { SURVIVAL_MODE_MVP_RULES } from '@/features/survival-mode/types';

import { getSurvivalBankRemainingMs } from './get-survival-bank-remaining-ms';

const STARTED_AT_MS = Date.parse('2026-08-19T12:00:00.000Z');

const T0 = SURVIVAL_MODE_MVP_RULES.initialBankSeconds;
const PLUS = SURVIVAL_MODE_MVP_RULES.correctDeltaSeconds;
const MINUS = SURVIVAL_MODE_MVP_RULES.wrongDeltaSeconds;

function remaining(args: {
    elapsedMs: number;
    correctCount: number;
    wrongCount: number;
}): number {
    return getSurvivalBankRemainingMs({
        startedAtMs: STARTED_AT_MS,
        nowMs: STARTED_AT_MS + args.elapsedMs,
        correctCount: args.correctCount,
        wrongCount: args.wrongCount,
    });
}

describe('getSurvivalBankRemainingMs', () => {
    it('starts at T0 when nothing is locked in', () => {
        expect(
            remaining({ elapsedMs: 0, correctCount: 0, wrongCount: 0 }),
        ).toBe(T0 * 1000);
        expect(
            remaining({ elapsedMs: 5_000, correctCount: 0, wrongCount: 0 }),
        ).toBe((T0 - 5) * 1000);
    });

    it('adds +4s for a correct lock-in and subtracts −6s for a wrong one', () => {
        expect(
            remaining({ elapsedMs: 5_000, correctCount: 1, wrongCount: 0 }),
        ).toBe((T0 + PLUS - 5) * 1000);
        expect(
            remaining({ elapsedMs: 5_000, correctCount: 0, wrongCount: 1 }),
        ).toBe((T0 - MINUS - 5) * 1000);
    });

    it('does not treat unanswered as wrong', () => {
        const withUnansweredIgnored = remaining({
            elapsedMs: 8_000,
            correctCount: 2,
            wrongCount: 0,
        });
        const ifUnansweredWereWrong = remaining({
            elapsedMs: 8_000,
            correctCount: 2,
            wrongCount: 3,
        });

        expect(withUnansweredIgnored).toBe((T0 + PLUS * 2 - 8) * 1000);
        expect(ifUnansweredWereWrong).toBeLessThan(withUnansweredIgnored);
    });

    it('floors remaining at 0 and does not apply grace', () => {
        expect(
            remaining({ elapsedMs: T0 * 1000, correctCount: 0, wrongCount: 0 }),
        ).toBe(0);
        expect(
            remaining({
                elapsedMs: T0 * 1000 + 1,
                correctCount: 0,
                wrongCount: 0,
            }),
        ).toBe(0);
        expect(
            remaining({ elapsedMs: 1_000, correctCount: 0, wrongCount: 4 }),
        ).toBe(0);
    });
});
