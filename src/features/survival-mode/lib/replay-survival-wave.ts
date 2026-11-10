/**
 * Точный пересчёт банка волны Survival по зафиксированным ответам
 * (pure, без Neon).
 *
 * Ответы фиксируются по одному (Answer lock-in), у каждого есть время
 * прихода на сервер — порядок известен. Проходим их по времени:
 * - банк в момент ответа = T0 + Σ(дельт засчитанных раньше) − (ответ − старт);
 * - ответ засчитан, если этот банк > 0 с допуском `graceSeconds` на сеть
 *   (иначе банк кончился раньше — дальше ничего не считается);
 * - засчитанный ответ двигает банк на +4 / −6; если неверный ответ увёл
 *   банк в ноль — волна на этом кончилась.
 *
 * AUDIO_GUESS: перед проверкой ответа на музыкальный вопрос к банку
 * добавляется пауза «окна прослушивания» — время на вопросе, но не больше
 * окна (`listening-window.ts`). Банк не кончается, пока звучит клип.
 *
 * Заменяет допущение «последний штраф списал только остаток»
 * (`isSurvivalClockOk`, Oct 30): оно было нужно, пока ответы приходили
 * пачкой без порядка. Старые страницы без фиксации идут прежним путём.
 *
 * ADR: docs/DECISIONS.md → Survival on answer lock-in.
 */

import { listeningCreditMs } from '@/features/quiz/lib/listening-window';
import { SURVIVAL_MODE_MVP_RULES } from '@/features/survival-mode/types';

export type SurvivalLockedAnswer = {
    questionId: string;
    selectedOptionId: string;
    isCorrect: boolean;
    /** Время прихода ответа на сервер (`QuizAnswer.answeredAt`). */
    answeredAtMs: number;
    /** Ответ на AUDIO_GUESS — к банку добавляется окно прослушивания. */
    isAudio?: boolean;
};

export type ReplaySurvivalWaveInput = {
    startedAtMs: number;
    /** Момент прихода сдачи волны на сервер. */
    completedAtMs: number;
    /** T0 волны (20 у первой, `bankRemainingSeconds` у следующих). */
    initialBankSeconds: number;
    answers: readonly SurvivalLockedAnswer[];
    correctDeltaSeconds?: number;
    wrongDeltaSeconds?: number;
    graceSeconds?: number;
};

export type ReplaySurvivalWaveResult = {
    /** Засчитанные ответы в порядке фиксации. */
    counted: SurvivalLockedAnswer[];
    /** Ответы после конца банка — в очки не идут. */
    late: SurvivalLockedAnswer[];
    /** Остаток банка на момент сдачи, целые секунды, ≥ 0. */
    bankRemainingSeconds: number;
    /** Банк дошёл до нуля (по времени или неверным ответом). */
    bankEmptied: boolean;
    /** Сумма пауз засчитанных аудиоответов, мс (`QuizResult.clockCreditMs`). */
    clockCreditMs: number;
};

export function replaySurvivalWave(
    input: ReplaySurvivalWaveInput,
): ReplaySurvivalWaveResult {
    const {
        startedAtMs,
        completedAtMs,
        initialBankSeconds,
        correctDeltaSeconds = SURVIVAL_MODE_MVP_RULES.correctDeltaSeconds,
        wrongDeltaSeconds = SURVIVAL_MODE_MVP_RULES.wrongDeltaSeconds,
        graceSeconds = SURVIVAL_MODE_MVP_RULES.graceSeconds,
    } = input;
    const graceMs = Math.max(0, graceSeconds) * 1000;
    const elapsedAt = (atMs: number) => Math.max(0, atMs - startedAtMs);

    // Бюджет без учёта прошедшего времени; банк = бюджет − elapsed.
    let budgetMs = Math.max(0, initialBankSeconds) * 1000;
    let emptied = false;
    let clockCreditMs = 0;
    let previousAtMs = startedAtMs;
    const counted: SurvivalLockedAnswer[] = [];
    const late: SurvivalLockedAnswer[] = [];

    const ordered = [...input.answers].sort(
        (left, right) => left.answeredAtMs - right.answeredAtMs,
    );

    for (const answer of ordered) {
        // Пауза на музыку — до проверки банка: клип не съедает время.
        const creditMs =
            answer.isAudio && !emptied
                ? listeningCreditMs(previousAtMs, answer.answeredAtMs)
                : 0;
        previousAtMs = answer.answeredAtMs;
        const bankMs = budgetMs + creditMs - elapsedAt(answer.answeredAtMs);
        if (emptied || bankMs + graceMs <= 0) {
            emptied = true;
            late.push(answer);
            continue;
        }

        counted.push(answer);
        budgetMs += creditMs;
        clockCreditMs += creditMs;
        budgetMs += answer.isCorrect
            ? correctDeltaSeconds * 1000
            : -wrongDeltaSeconds * 1000;

        if (budgetMs - elapsedAt(answer.answeredAtMs) <= 0) {
            // Неверный ответ съел остаток — волна кончилась на нём.
            emptied = true;
        }
    }

    const finalBankMs = emptied
        ? 0
        : Math.max(0, budgetMs - elapsedAt(completedAtMs));

    return {
        counted,
        late,
        bankRemainingSeconds: Math.floor(finalBankMs / 1000),
        bankEmptied: emptied || finalBankMs <= 0,
        clockCreditMs,
    };
}
