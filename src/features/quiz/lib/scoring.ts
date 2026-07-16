import type { Difficulty } from '@/features/quiz/types';

/** Очки за верный ответ по сложности. Неверные / без ответа = 0. */
export const DIFFICULTY_POINTS: Record<Difficulty, number> = {
    EASY: 1,
    MEDIUM: 2,
    HARD: 3,
};

// функция для получения очков за сложность
export function getDifficultyPoints(difficulty: Difficulty): number {
    return DIFFICULTY_POINTS[difficulty];
}

/** Максимум очков сессии по сложностям вопросов (для UI). */
export function getMaxPossibleScore(difficulties: Difficulty[]): number {
    return difficulties.reduce(
        (sum, difficulty) => sum + getDifficultyPoints(difficulty),
        0,
    );
}

type ScoringQuestion = {
    id: string;
    difficulty: Difficulty;
    options: Array<{
        id: string;
        isCorrect: boolean;
    }>;
};

type ScoringAnswer = {
    questionId: string;
    selectedOptionId: string;
};

export type QuizScoreResult = {
    correctCount: number;
    totalQuestions: number;
    /** Сумма весов за верные ответы */
    score: number;
    /** Сумма весов всех вопросов сессии (для UI «12 / 18») */
    maxPossibleScore: number;
};

/**
 * Подсчёт очков на сервере.
 * score — очки по сложности; correctCount — число верных.
 * Исторические QuizResult с score === correctCount не пересчитываем.
 */
export function calculateQuizScore(
    questions: ScoringQuestion[],
    answers: ScoringAnswer[],
): QuizScoreResult {
    let correctCount = 0;
    let score = 0;
    let maxPossibleScore = 0;

    for (const question of questions) {
        const weight = getDifficultyPoints(question.difficulty);
        maxPossibleScore += weight;

        const answer = answers.find((item) => item.questionId === question.id);

        if (!answer) {
            continue;
        }

        const selectedOption = question.options.find(
            (option) => option.id === answer.selectedOptionId,
        );

        if (selectedOption?.isCorrect) {
            correctCount += 1;
            score += weight;
        }
    }

    return {
        correctCount,
        totalQuestions: questions.length,
        score,
        maxPossibleScore,
    };
}
