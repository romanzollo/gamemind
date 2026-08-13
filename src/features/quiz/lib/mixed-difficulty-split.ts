/**
 * Фиксированный сплит смешанной сложности (Classic + Blitz).
 *
 * Зачем отдельный pure-модуль: игрок не выбирает доли — рецепт залок
 * продуктом. Pick (3× UserQuestionCycle) и UI meta читают одну таблицу;
 * scoring не трогаем — он уже суммирует веса вопросов из snapshot.
 *
 * MIXED не является Question.difficulty: у вопроса только EASY|MEDIUM|HARD.
 * Canon: DECISIONS.md → Mixed-difficulty quiz; ROADMAP §11.3.
 */

import type { Difficulty } from '@/features/quiz/types';

import { getDifficultyPoints } from '@/features/quiz/lib/scoring';

/** Допустимые длины mix-сессии (Classic 3/5/10 и Blitz 10). */
export const MIXED_QUESTION_COUNTS = [3, 5, 10] as const;

export type MixedQuestionCount = (typeof MIXED_QUESTION_COUNTS)[number];

/** Сколько вопросов взять из каждого мешка цикла. */
export type MixedDifficultySplit = {
    EASY: number;
    MEDIUM: number;
    HARD: number;
};

const MIXED_SPLIT_BY_COUNT: Record<MixedQuestionCount, MixedDifficultySplit> = {
    3: { EASY: 1, MEDIUM: 1, HARD: 1 },
    5: { EASY: 2, MEDIUM: 2, HARD: 1 },
    10: { EASY: 4, MEDIUM: 3, HARD: 3 },
};

export function isMixedQuestionCount(
    questionCount: number,
): questionCount is MixedQuestionCount {
    return (
        questionCount === 3 || questionCount === 5 || questionCount === 10
    );
}

/**
 * Рецепт mix для длины сессии. `null` = такой count для MIXED нельзя
 * (не добирать random и не выдумывать доли).
 */
export function getMixedDifficultySplit(
    questionCount: number,
): MixedDifficultySplit | null {
    if (!isMixedQuestionCount(questionCount)) {
        return null;
    }

    return MIXED_SPLIT_BY_COUNT[questionCount];
}

/** Последовательность cycle-draw: EASY → MEDIUM → HARD. */
export function listMixedCycleDraws(
    split: MixedDifficultySplit,
): Array<{ difficulty: Difficulty; needed: number }> {
    return [
        { difficulty: 'EASY', needed: split.EASY },
        { difficulty: 'MEDIUM', needed: split.MEDIUM },
        { difficulty: 'HARD', needed: split.HARD },
    ];
}

/** Максимум очков mix-сессии (все верные) — для UI/тестов, не для submit. */
export function getMixedMaxPossibleScore(questionCount: number): number | null {
    const split = getMixedDifficultySplit(questionCount);

    if (!split) {
        return null;
    }

    return listMixedCycleDraws(split).reduce(
        (sum, draw) => sum + draw.needed * getDifficultyPoints(draw.difficulty),
        0,
    );
}
