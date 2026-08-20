/**
 * Реконструкция T0' после успешного complete волны (pure, без Neon).
 *
 * Пишется в `SurvivalRun.bankRemainingSeconds` на pooled after-hop —
 * не в completeWithResult, не из client remaining.
 *
 * Формула (выбор D, без grace):
 * - elapsed = completedAt − startedAt
 * - budget = max(0, T0 + 4×correct − 6×wrong)
 * - remainingSeconds = max(0, floor((budgetMs − elapsedMs) / 1000))
 *
 * Grace остаётся только в `isSurvivalClockOk` (допуск submit).
 * T0' намеренно без grace: иначе «чуть за гранью budget» всё равно
 * давало бы continue с фальшивым банком.
 *
 * Unanswered не в wrongCount (−6 нет). Canon: Survival Mode MVP wave 2+.
 */

import {
    SURVIVAL_MODE_MVP_RULES,
    type SurvivalBankRemainingReconstructInput,
} from '@/features/survival-mode/types';

function isFiniteNumber(value: number): boolean {
    return Number.isFinite(value);
}

function toNonNegativeCount(value: number): number {
    if (!isFiniteNumber(value) || value < 0) {
        return 0;
    }

    return Math.trunc(value);
}

/**
 * Целые секунды остатка банка для следующей волны (или 0 → terminal).
 */
export function reconstructSurvivalBankRemainingSeconds(
    input: SurvivalBankRemainingReconstructInput,
): number {
    const {
        startedAtMs,
        completedAtMs,
        correctCount,
        wrongCount,
        initialBankSeconds = SURVIVAL_MODE_MVP_RULES.initialBankSeconds,
        correctDeltaSeconds = SURVIVAL_MODE_MVP_RULES.correctDeltaSeconds,
        wrongDeltaSeconds = SURVIVAL_MODE_MVP_RULES.wrongDeltaSeconds,
    } = input;

    if (
        !isFiniteNumber(startedAtMs) ||
        !isFiniteNumber(completedAtMs) ||
        !isFiniteNumber(initialBankSeconds) ||
        !isFiniteNumber(correctDeltaSeconds) ||
        !isFiniteNumber(wrongDeltaSeconds)
    ) {
        return 0;
    }

    const elapsedMs = Math.max(0, completedAtMs - startedAtMs);
    const correct = toNonNegativeCount(correctCount);
    const wrong = toNonNegativeCount(wrongCount);

    const rawBudgetSeconds =
        initialBankSeconds +
        correctDeltaSeconds * correct -
        wrongDeltaSeconds * wrong;
    const budgetMs = Math.max(0, rawBudgetSeconds) * 1000;
    const remainingMs = Math.max(0, budgetMs - elapsedMs);

    return Math.floor(remainingMs / 1000);
}
