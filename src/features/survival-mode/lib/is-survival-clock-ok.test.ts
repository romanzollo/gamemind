/**
 * Unit-тесты сверки Survival-банка.
 *
 * Зачем: submit позже выставит `survivalClockOk` из этой функции;
 * тесты фиксируют формулу, чтобы рефактор не съел grace, не ушёл
 * в отрицательный budget и не начал штрафовать unanswered как wrong.
 * Pure — без Neon (docs/TESTING.md).
 */

import { describe, expect, it } from 'vitest';

import { SURVIVAL_MODE_MVP_RULES } from '@/features/survival-mode/types';

import { isSurvivalClockOk } from './is-survival-clock-ok';

const STARTED_AT_MS = Date.parse('2026-08-19T12:00:00.000Z');

const T0 = SURVIVAL_MODE_MVP_RULES.initialBankSeconds;
const PLUS = SURVIVAL_MODE_MVP_RULES.correctDeltaSeconds;
const MINUS = SURVIVAL_MODE_MVP_RULES.wrongDeltaSeconds;
const GRACE = SURVIVAL_MODE_MVP_RULES.graceSeconds;

function check(args: {
    elapsedMs: number;
    correctCount: number;
    wrongCount: number;
}): boolean {
    return isSurvivalClockOk({
        startedAtMs: STARTED_AT_MS,
        completedAtMs: STARTED_AT_MS + args.elapsedMs,
        correctCount: args.correctCount,
        wrongCount: args.wrongCount,
    });
}

describe('isSurvivalClockOk', () => {
    it('returns true when elapsed is inside the reconstructed budget', () => {
        const correctCount = 5;
        const wrongCount = 1;
        const budgetMs = (T0 + PLUS * correctCount - MINUS * wrongCount) * 1000;

        expect(
            check({
                elapsedMs: budgetMs - 1_000,
                correctCount,
                wrongCount,
            }),
        ).toBe(true);
        expect(
            check({
                elapsedMs: budgetMs,
                correctCount,
                wrongCount,
            }),
        ).toBe(true);
    });

    it('returns true on the grace boundary and false 1ms after', () => {
        const correctCount = 5;
        const wrongCount = 0;
        const budgetMs = (T0 + PLUS * correctCount) * 1000;
        const allowedMs = budgetMs + GRACE * 1000;

        expect(
            check({
                elapsedMs: allowedMs,
                correctCount,
                wrongCount,
            }),
        ).toBe(true);
        expect(
            check({
                elapsedMs: allowedMs + 1,
                correctCount,
                wrongCount,
            }),
        ).toBe(false);
    });

    it('returns false for a pause-cheat far beyond budget + grace', () => {
        expect(
            check({
                elapsedMs: 60_000,
                correctCount: 0,
                wrongCount: 0,
            }),
        ).toBe(false);
    });

    it('floors budget at 0 so five quick wrongs still pass within grace', () => {
        // Даже без последнего штрафа банк ушёл в минус: 20 − 6×4 < 0.
        const rawBudgetSeconds = T0 + PLUS * 0 - MINUS * 4;
        expect(rawBudgetSeconds).toBeLessThan(0);

        expect(
            check({
                elapsedMs: 1_000,
                correctCount: 0,
                wrongCount: 5,
            }),
        ).toBe(true);
        expect(
            check({
                elapsedMs: GRACE * 1000,
                correctCount: 0,
                wrongCount: 5,
            }),
        ).toBe(true);
        expect(
            check({
                elapsedMs: GRACE * 1000 + 1,
                correctCount: 0,
                wrongCount: 5,
            }),
        ).toBe(false);
    });

    it('accepts a wave ended by a last wrong answer that only drained the bank', () => {
        // Прод, окт 2026: 2 неверных, банк 20 − 12 = 8 с, а сдача пришла на
        // 14-й секунде: второй неверный дан при остатке ~2 с и увёл банк в минус.
        expect(
            check({
                elapsedMs: 14_000,
                correctCount: 0,
                wrongCount: 2,
            }),
        ).toBe(true);
        // Тот же ответ, но сдача позже допуска: банк без последнего штрафа
        // 14 с + grace — дальше волна уже не засчитывается.
        expect(
            check({
                elapsedMs: (T0 - MINUS + GRACE) * 1000 + 1,
                correctCount: 0,
                wrongCount: 2,
            }),
        ).toBe(false);
    });

    it('gives no penalty allowance when every answer was right', () => {
        const correctCount = 3;
        const allowedMs = (T0 + PLUS * correctCount + GRACE) * 1000;

        expect(check({ elapsedMs: allowedMs + 1, correctCount, wrongCount: 0 })).toBe(
            false,
        );
    });

    it('does not apply −6s for unanswered (wrongCount stays 0)', () => {
        const correctCount = 8;
        const unanswered = 4;
        const elapsedMs = 40_000;

        const honestBudgetMs = (T0 + PLUS * correctCount) * 1000;
        const ifUnansweredWereWrongMs =
            (T0 + PLUS * correctCount - MINUS * unanswered) * 1000;

        expect(elapsedMs).toBeLessThanOrEqual(honestBudgetMs + GRACE * 1000);
        expect(elapsedMs).toBeGreaterThan(ifUnansweredWereWrongMs + GRACE * 1000);

        expect(
            check({
                elapsedMs,
                correctCount,
                wrongCount: 0,
            }),
        ).toBe(true);
    });
});
