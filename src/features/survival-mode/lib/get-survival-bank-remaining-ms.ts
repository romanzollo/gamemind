/**
 * Клиентский remaining Survival-банка (UX, не авторитет).
 *
 * Формула совпадает с budget в `isSurvivalClockOk`, но без grace:
 * remaining = max(0, budget − elapsed). Grace — только серверный submit.
 * Не звать `isSurvivalClockOk` как gate на клиенте.
 *
 * Canon: docs/DECISIONS.md → Survival Mode MVP.
 */

import { SURVIVAL_MODE_MVP_RULES } from '@/features/survival-mode/types';

export type SurvivalBankRemainingInput = {
    startedAtMs: number;
    nowMs: number;
    correctCount: number;
    wrongCount: number;
    initialBankSeconds?: number;
    correctDeltaSeconds?: number;
    wrongDeltaSeconds?: number;
};

function isFiniteNumber(value: number): boolean {
    return Number.isFinite(value);
}

function toNonNegativeCount(value: number): number {
    if (!isFiniteNumber(value) || value < 0) {
        return 0;
    }

    return Math.trunc(value);
}

export function getSurvivalBankRemainingMs(
    input: SurvivalBankRemainingInput,
): number {
    const {
        startedAtMs,
        nowMs,
        correctCount,
        wrongCount,
        initialBankSeconds = SURVIVAL_MODE_MVP_RULES.initialBankSeconds,
        correctDeltaSeconds = SURVIVAL_MODE_MVP_RULES.correctDeltaSeconds,
        wrongDeltaSeconds = SURVIVAL_MODE_MVP_RULES.wrongDeltaSeconds,
    } = input;

    if (
        !isFiniteNumber(startedAtMs) ||
        !isFiniteNumber(nowMs) ||
        !isFiniteNumber(initialBankSeconds) ||
        !isFiniteNumber(correctDeltaSeconds) ||
        !isFiniteNumber(wrongDeltaSeconds)
    ) {
        return 0;
    }

    const elapsedMs = Math.max(0, nowMs - startedAtMs);
    const correct = toNonNegativeCount(correctCount);
    const wrong = toNonNegativeCount(wrongCount);
    const rawBudgetSeconds =
        initialBankSeconds +
        correctDeltaSeconds * correct -
        wrongDeltaSeconds * wrong;
    const budgetMs = Math.max(0, rawBudgetSeconds) * 1000;

    return Math.max(0, budgetMs - elapsedMs);
}
