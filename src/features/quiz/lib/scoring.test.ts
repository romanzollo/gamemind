/**
 * Unit-тесты серверного scoring.
 *
 * Зачем: score считается на сервере по весам сложности; тесты фиксируют
 * правила, чтобы рефактор не превратил HARD в 1 очко «случайно».
 * Pure functions — без Neon / session (см. docs/TESTING.md Phase B).
 */

import { describe, expect, it } from 'vitest';

import type { Difficulty } from '@/features/quiz/types';

import {
    calculateQuizScore,
    getDifficultyPoints,
    getMaxPossibleScore,
} from './scoring';

/** Минимальный вопрос для scoring: id, сложность, correct + wrong option. */
function makeQuestion(
    id: string,
    difficulty: Difficulty,
    correctOptionId = `${id}-correct`,
    wrongOptionId = `${id}-wrong`,
) {
    return {
        id,
        difficulty,
        options: [
            { id: correctOptionId, isCorrect: true },
            { id: wrongOptionId, isCorrect: false },
        ],
    };
}

describe('getDifficultyPoints', () => {
    it('returns weight 1 / 2 / 3 for EASY / MEDIUM / HARD', () => {
        expect(getDifficultyPoints('EASY')).toBe(1);
        expect(getDifficultyPoints('MEDIUM')).toBe(2);
        expect(getDifficultyPoints('HARD')).toBe(3);
    });
});

describe('getMaxPossibleScore', () => {
    it('sums difficulty weights across the session', () => {
        const difficulties = ['EASY', 'MEDIUM', 'HARD'] as const;

        const max = getMaxPossibleScore([...difficulties]);

        expect(max).toBe(6);
    });

    it('returns 0 for an empty session', () => {
        expect(getMaxPossibleScore([])).toBe(0);
    });
});

describe('calculateQuizScore', () => {
    it('awards difficulty weight for a correct answer', () => {
        const questions = [makeQuestion('q1', 'HARD')];
        const answers = [{ questionId: 'q1', selectedOptionId: 'q1-correct' }];

        const result = calculateQuizScore(questions, answers);

        expect(result).toEqual({
            correctCount: 1,
            totalQuestions: 1,
            score: 3,
            maxPossibleScore: 3,
        });
    });

    it('gives 0 score for a wrong answer but still counts the question toward max', () => {
        const questions = [makeQuestion('q1', 'MEDIUM')];
        const answers = [{ questionId: 'q1', selectedOptionId: 'q1-wrong' }];

        const result = calculateQuizScore(questions, answers);

        expect(result).toEqual({
            correctCount: 0,
            totalQuestions: 1,
            score: 0,
            maxPossibleScore: 2,
        });
    });

    it('treats a missing answer as incorrect (0) without changing maxPossibleScore', () => {
        const questions = [makeQuestion('q1', 'EASY')];

        const result = calculateQuizScore(questions, []);

        expect(result).toEqual({
            correctCount: 0,
            totalQuestions: 1,
            score: 0,
            maxPossibleScore: 1,
        });
    });

    it('mixes correct, wrong, and missing across difficulties', () => {
        // EASY correct (+1), MEDIUM wrong (+0), HARD unanswered (+0) → score 1 / max 6
        const questions = [
            makeQuestion('easy', 'EASY'),
            makeQuestion('medium', 'MEDIUM'),
            makeQuestion('hard', 'HARD'),
        ];
        const answers = [
            { questionId: 'easy', selectedOptionId: 'easy-correct' },
            { questionId: 'medium', selectedOptionId: 'medium-wrong' },
            // hard — нет ответа
        ];

        const result = calculateQuizScore(questions, answers);

        expect(result).toEqual({
            correctCount: 1,
            totalQuestions: 3,
            score: 1,
            maxPossibleScore: 6,
        });
    });
});
