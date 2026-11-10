import { describe, expect, it } from 'vitest';

import {
    replaySurvivalWave,
    type SurvivalLockedAnswer,
} from './replay-survival-wave';

const START = 1_000_000;
const at = (seconds: number) => START + seconds * 1000;

function answer(
    id: string,
    seconds: number,
    isCorrect: boolean,
): SurvivalLockedAnswer {
    return {
        questionId: id,
        selectedOptionId: `${id}-opt`,
        isCorrect,
        answeredAtMs: at(seconds),
    };
}

describe('replaySurvivalWave', () => {
    it('counts answers in lock order and leaves the bank at submit time', () => {
        const result = replaySurvivalWave({
            startedAtMs: START,
            completedAtMs: at(10),
            initialBankSeconds: 20,
            // Пришли не по порядку — сортировка по времени фиксации.
            answers: [answer('q2', 6, false), answer('q1', 3, true)],
        });

        expect(result.counted.map((item) => item.questionId)).toEqual([
            'q1',
            'q2',
        ]);
        expect(result.late).toEqual([]);
        // 20 + 4 − 6 − 10 с = 8 с.
        expect(result.bankRemainingSeconds).toBe(8);
        expect(result.bankEmptied).toBe(false);
    });

    it('counts a wrong answer given with less than 6 s left, then ends the wave on it', () => {
        const result = replaySurvivalWave({
            startedAtMs: START,
            completedAtMs: at(18.5),
            initialBankSeconds: 20,
            answers: [answer('q1', 18, false), answer('q2', 18.2, true)],
        });

        // Ответ на 18-й секунде (банк 2 с) — в зачёте; −6 обнулило банк.
        expect(result.counted.map((item) => item.questionId)).toEqual(['q1']);
        expect(result.late.map((item) => item.questionId)).toEqual(['q2']);
        expect(result.bankEmptied).toBe(true);
        expect(result.bankRemainingSeconds).toBe(0);
    });

    it('does not count answers that arrived after the bank ran out, beyond the grace', () => {
        const result = replaySurvivalWave({
            startedAtMs: START,
            completedAtMs: at(30),
            initialBankSeconds: 20,
            answers: [answer('q1', 22, true), answer('q2', 25, true)],
        });

        // 22 с: банк −2 с, допуск 3 с — ещё в зачёте, +4 → банк 2 с.
        // 25 с: банк 20 + 4 − 25 = −1 с … в допуске, +4 → 3 с.
        expect(result.counted).toHaveLength(2);

        const tooLate = replaySurvivalWave({
            startedAtMs: START,
            completedAtMs: at(30),
            initialBankSeconds: 20,
            answers: [answer('q1', 23.5, true)],
        });

        expect(tooLate.counted).toEqual([]);
        expect(tooLate.late).toHaveLength(1);
        expect(tooLate.bankEmptied).toBe(true);
        expect(tooLate.bankRemainingSeconds).toBe(0);
    });

    it('empties the bank by time when nobody answers', () => {
        const result = replaySurvivalWave({
            startedAtMs: START,
            completedAtMs: at(21),
            initialBankSeconds: 20,
            answers: [],
        });

        expect(result.bankEmptied).toBe(true);
        expect(result.bankRemainingSeconds).toBe(0);
    });

    it('starts from T0 of the wave (wave 2+ carries the leftover)', () => {
        const result = replaySurvivalWave({
            startedAtMs: START,
            completedAtMs: at(4),
            initialBankSeconds: 7,
            answers: [answer('q1', 2, true)],
        });

        // 7 + 4 − 4 = 7 с.
        expect(result.bankRemainingSeconds).toBe(7);
    });

    it('stops the bank while the player is on an audio question (up to the window)', () => {
        // Банк 5 с. Музыкальный вопрос показан на 2-й секунде (после q1),
        // ответ на 11-й: без паузы банк кончился бы на 7-й (5 + 4 − 2 = 7).
        const result = replaySurvivalWave({
            startedAtMs: START,
            completedAtMs: at(12),
            initialBankSeconds: 5,
            answers: [
                answer('q1', 2, true),
                { ...answer('a1', 11, true), isAudio: true },
            ],
        });

        expect(result.counted.map((item) => item.questionId)).toEqual(['q1', 'a1']);
        // Пауза 9 с. Банк: 5 + 4 + 9 + 4 − 12 = 10 с.
        expect(result.clockCreditMs).toBe(9000);
        expect(result.bankRemainingSeconds).toBe(10);
    });

    it('gives at most the window, then the bank runs again', () => {
        // Банк 20 с, музыка с 0-й секунды, ответ на 40-й: пауза 12 с,
        // банк к ответу 20 + 12 − 40 < 0 (с grace 3 с) — не засчитан.
        const result = replaySurvivalWave({
            startedAtMs: START,
            completedAtMs: at(40),
            initialBankSeconds: 20,
            answers: [{ ...answer('a1', 40, true), isAudio: true }],
        });

        expect(result.counted).toEqual([]);
        expect(result.bankEmptied).toBe(true);
        expect(result.clockCreditMs).toBe(0);
    });

    it('without audio answers keeps the old numbers', () => {
        const result = replaySurvivalWave({
            startedAtMs: START,
            completedAtMs: at(10),
            initialBankSeconds: 20,
            answers: [answer('q1', 3, true), answer('q2', 6, false)],
        });
        expect(result.bankRemainingSeconds).toBe(8);
        expect(result.clockCreditMs).toBe(0);
    });
});
