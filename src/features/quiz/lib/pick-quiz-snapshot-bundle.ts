/**
 * Mode-specific snapshot pick wrappers (Classic / Timed).
 *
 * Classic + Timed: seeded UserQuestionCycle (raw pg scalars) → resolve by ids.
 * Daily Challenge сюда не ходит — frozen ids дня.
 *
 * Анти-паттерн (снят): Prisma JSONB remaining + Promise.race budget +
 * fallback random — давал повторы IMAGE_GUESS при «успешном» старте.
 * Теперь cycle обязан отработать; ошибка → наверх (не тихий random).
 *
 * Canon: QUIZ_NEON_HOT_PATH + User Question Cycle (seeded cursor).
 */

import { questionRepository } from '@/entities/question/question.repository';
import type { QuestionSnapshotBundleItem } from '@/entities/question/question.types';
import { userQuestionCycleRepository } from '@/entities/user-question-cycle/user-question-cycle.repository';
import type { Locale } from '@/shared/i18n';
import type { Difficulty } from '@/types';

async function pickUserCycleSnapshotBundle(
    userId: string,
    difficulty: Difficulty,
    questionCount: number,
    locale: Locale,
): Promise<QuestionSnapshotBundleItem[]> {
    const drawn = await userQuestionCycleRepository.drawQuestionIds({
        userId,
        difficulty,
        needed: questionCount,
    });

    if (!drawn.ok || drawn.questionIds.length < questionCount) {
        return [];
    }

    return questionRepository.pickSnapshotBundleByQuestionIds(
        drawn.questionIds,
        locale,
    );
}

/**
 * Classic lobby/rematch pick (анти-повтор по difficulty).
 * Матрица: Easy 3 → 5 → 10; rematch без повторов до исчерпания цикла.
 */
export function pickClassicSnapshotBundle(
    userId: string,
    difficulty: Difficulty,
    questionCount: number,
    locale: Locale,
): Promise<QuestionSnapshotBundleItem[]> {
    return pickUserCycleSnapshotBundle(
        userId,
        difficulty,
        questionCount,
        locale,
    );
}

/**
 * Blitz/Timed pick (тот же мешок difficulty, что Classic).
 */
export function pickTimedSnapshotBundle(
    userId: string,
    difficulty: Difficulty,
    questionCount: number,
    locale: Locale,
): Promise<QuestionSnapshotBundleItem[]> {
    return pickUserCycleSnapshotBundle(
        userId,
        difficulty,
        questionCount,
        locale,
    );
}
