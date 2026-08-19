/**
 * Серверная сверка Survival-банка на submit (pure, без Neon).
 *
 * Клиентский remaining — только UX. Авторитет: `startedAt` / `completedAt`
 * + correct/wrong из snapshot. Unanswered не входят в `wrongCount`
 * (штраф −6с не ставим — как Blitz: нет ответа = 0 очков, без банка).
 *
 * Формула (canon: Survival Mode MVP):
 * - elapsed = completedAt − startedAt
 * - budget = max(0, T0 + 4×correct − 6×wrong)
 * - clockOk ⇔ elapsed ≤ budget + grace
 *
 * Grace прибавляем к budget, не к elapsed: иначе допуск сужается
 * и Neon-лаг карает честный submit. Не путать с Timed (`timedEndsAt`).
 */

import {
    SURVIVAL_MODE_MVP_RULES,
    type SurvivalClockCheckInput,
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

export function isSurvivalClockOk(input: SurvivalClockCheckInput): boolean {
    const {
        startedAtMs,
        completedAtMs,
        correctCount,
        wrongCount,
        initialBankSeconds = SURVIVAL_MODE_MVP_RULES.initialBankSeconds,
        correctDeltaSeconds = SURVIVAL_MODE_MVP_RULES.correctDeltaSeconds,
        wrongDeltaSeconds = SURVIVAL_MODE_MVP_RULES.wrongDeltaSeconds,
        graceSeconds = SURVIVAL_MODE_MVP_RULES.graceSeconds,
    } = input;

    if (
        !isFiniteNumber(startedAtMs) ||
        !isFiniteNumber(completedAtMs) ||
        !isFiniteNumber(initialBankSeconds) ||
        !isFiniteNumber(correctDeltaSeconds) ||
        !isFiniteNumber(wrongDeltaSeconds) ||
        !isFiniteNumber(graceSeconds)
    ) {
        return false;
    }

    const elapsedMs = Math.max(0, completedAtMs - startedAtMs);
    const correct = toNonNegativeCount(correctCount);
    const wrong = toNonNegativeCount(wrongCount);

    const rawBudgetSeconds =
        initialBankSeconds +
        correctDeltaSeconds * correct -
        wrongDeltaSeconds * wrong;
    const budgetMs = Math.max(0, rawBudgetSeconds) * 1000;
    const graceMs = Math.max(0, graceSeconds) * 1000;

    return elapsedMs <= budgetMs + graceMs;
}
