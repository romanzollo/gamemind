/**
 * Unit-тесты реконструкции T0' после Survival complete.
 *
 * Фиксируем: без grace; floor до секунд; unanswered ≠ wrong;
 * carry T0' с initialBankSeconds ≠ 20; невалидный input → 0.
 * Pure — без Neon (docs/TESTING.md).
 */

import { describe, expect, it } from 'vitest';

import { SURVIVAL_MODE_MVP_RULES } from '@/features/survival-mode/types';

import { reconstructSurvivalBankRemainingSeconds } from './reconstruct-survival-bank-remaining-seconds';

const STARTED_AT_MS = Date.parse('2026-08-20T12:00:00.000Z');

const T0 = SURVIVAL_MODE_MVP_RULES.initialBankSeconds;
const PLUS = SURVIVAL_MODE_MVP_RULES.correctDeltaSeconds;
const MINUS = SURVIVAL_MODE_MVP_RULES.wrongDeltaSeconds;
const GRACE = SURVIVAL_MODE_MVP_RULES.graceSeconds;

function remaining(args: {
    elapsedMs: number;
    correctCount: number;
    wrongCount: number;
    initialBankSeconds?: number;
}): number {
    return reconstructSurvivalBankRemainingSeconds({
        startedAtMs: STARTED_AT_MS,
        completedAtMs: STARTED_AT_MS + args.elapsedMs,
        correctCount: args.correctCount,
        wrongCount: args.wrongCount,
        initialBankSeconds: args.initialBankSeconds,
    });
}

describe('reconstructSurvivalBankRemainingSeconds', () => {
    it('returns floor seconds of budget minus elapsed (no grace)', () => {
        const correctCount = 5;
        const wrongCount = 1;
        const budgetSeconds = T0 + PLUS * correctCount - MINUS * wrongCount;
        const elapsedMs = (budgetSeconds - 7) * 1000 + 400;

        expect(
            remaining({
                elapsedMs,
                correctCount,
                wrongCount,
            }),
        ).toBe(6);
    });

    it('does not add grace to remaining (unlike isSurvivalClockOk)', () => {
        const correctCount = 0;
        const wrongCount = 0;
        const budgetMs = T0 * 1000;
        const elapsedMs = budgetMs + 1;

        expect(
            remaining({
                elapsedMs,
                correctCount,
                wrongCount,
            }),
        ).toBe(0);

        expect(GRACE).toBeGreaterThan(0);
        expect(elapsedMs).toBeLessThanOrEqual(budgetMs + GRACE * 1000);
    });

    it('floors sub-second remainder to 0 when under 1000ms left', () => {
        const budgetMs = T0 * 1000;
        const elapsedMs = budgetMs - 999;

        expect(
            remaining({
                elapsedMs,
                correctCount: 0,
                wrongCount: 0,
            }),
        ).toBe(0);
    });

    it('returns 0 when budget is floored by many wrongs', () => {
        expect(
            remaining({
                elapsedMs: 500,
                correctCount: 0,
                wrongCount: 4,
            }),
        ).toBe(0);
    });

    it('does not apply −6s for unanswered (wrongCount stays 0)', () => {
        const correctCount = 8;
        const elapsedMs = 30_000;
        const honestBudgetSeconds = T0 + PLUS * correctCount;
        const ifUnansweredWereWrong =
            T0 + PLUS * correctCount - MINUS * 4;

        expect(
            remaining({
                elapsedMs,
                correctCount,
                wrongCount: 0,
            }),
        ).toBe(honestBudgetSeconds - 30);

        expect(ifUnansweredWereWrong - 30).toBeLessThan(
            honestBudgetSeconds - 30,
        );
    });

    it('uses carried initialBankSeconds for wave 2+ (not always T0=20)', () => {
        const carried = 11;
        const correctCount = 2;
        const wrongCount = 0;
        const budgetSeconds = carried + PLUS * correctCount;
        const elapsedMs = 5_000;

        expect(
            remaining({
                elapsedMs,
                correctCount,
                wrongCount,
                initialBankSeconds: carried,
            }),
        ).toBe(budgetSeconds - 5);
    });

    it('returns 0 for non-finite timestamps', () => {
        expect(
            reconstructSurvivalBankRemainingSeconds({
                startedAtMs: Number.NaN,
                completedAtMs: STARTED_AT_MS + 1_000,
                correctCount: 1,
                wrongCount: 0,
            }),
        ).toBe(0);
    });
});
