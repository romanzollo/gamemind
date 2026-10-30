/**
 * Серверная сверка Survival-банка на submit (pure, без Neon).
 *
 * Клиентский remaining — только UX. Авторитет: `startedAt` / `completedAt`
 * + correct/wrong из snapshot. Unanswered не входят в `wrongCount`
 * (штраф −6с не ставим — как Blitz: нет ответа = 0 очков, без банка).
 *
 * Формула (canon: Survival Mode MVP):
 * - elapsed = completedAt − startedAt
 * - budget = max(0, T0 + 4×correct − 6×(wrong − 1)), если wrong ≥ 1;
 *   иначе max(0, T0 + 4×correct)
 * - clockOk ⇔ elapsed ≤ budget + grace
 *
 * Почему один штраф не считаем целиком: неверный ответ при остатке банка
 * меньше 6 с уводит банк в минус, и клиент сразу сдаёт волну. Ответ дан,
 * пока банк был > 0, но полный −6 сдвигал «конец банка» раньше ответа —
 * честные волны получали clockOk=false и 0 очков (прод, окт 2026: все 8
 * обнулённых волн 1). Порядок ответов сервер не знает (приходят пачкой),
 * поэтому допускаем, что последний штраф списал только остаток. Цена:
 * подделанный клиент выиграет ≤ 6 с при хотя бы одном неверном ответе.
 * ADR: docs/DECISIONS.md → Survival clock — start delay and partial last penalty.
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

    // Последний штраф мог списать только остаток банка (см. шапку).
    const fullPenalties = Math.max(0, wrong - 1);
    const rawBudgetSeconds =
        initialBankSeconds +
        correctDeltaSeconds * correct -
        wrongDeltaSeconds * fullPenalties;
    const budgetMs = Math.max(0, rawBudgetSeconds) * 1000;
    const graceMs = Math.max(0, graceSeconds) * 1000;

    return elapsedMs <= budgetMs + graceMs;
}
