/**
 * Survival pick: следующая порция того же UserQuestionCycle, что у Classic и
 * Blitz этой сложности, минус id, уже сыгранные в забеге.
 *
 * Зачем общий цикл: случайный выбор из всего пула на каждый забег возвращал
 * вопросы прошлых забегов уже через пару волн. Один seeded-цикл на сложность
 * не повторяет вопрос ни в одном режиме, пока пул не пройден целиком.
 * Внутри забега повторов нет и на границе цикла: сыгранные id исключены
 * (drawFromSeededCycle → excludeIds). Последняя волна может быть короче.
 *
 * Hop: pooled cycle draw → 300ms settle → Direct resolve-by-ids (chunk 5).
 * Canon: docs/DECISIONS.md → Survival Mode MVP (question source);
 * QUIZ_NEON_HOT_PATH.md.
 */

import { questionRepository } from '@/entities/question/question.repository';
import type { QuestionSnapshotBundleItem } from '@/entities/question/question.types';
import { userQuestionCycleRepository } from '@/entities/user-question-cycle/user-question-cycle.repository';
import type { Locale } from '@/shared/i18n';
import type { Difficulty } from '@/types';

/** Как Classic/Timed: после pooled нельзя сразу открывать Direct resolve. */
const AFTER_POOL_RESOLVE_SETTLE_MS = 300;

export type PickSurvivalSnapshotBundleInput = {
    userId: string;
    difficulty: Difficulty;
    questionCount: number;
    locale: Locale;
    /** Ids уже сыгранные в этом SurvivalRun. Волна 1 = []. */
    excludeQuestionIds: string[];
};

async function settleAfterPoolBeforeDirectResolve() {
    await new Promise((resolve) =>
        setTimeout(resolve, AFTER_POOL_RESOLVE_SETTLE_MS),
    );
}

/**
 * До `questionCount` ids (короткая последняя волна 1..11 OK).
 * Пустой массив = pool exhausted / 0 unseen. Не silent random fallback.
 */
export async function pickSurvivalSnapshotBundle(
    input: PickSurvivalSnapshotBundleInput,
): Promise<QuestionSnapshotBundleItem[]> {
    if (input.questionCount <= 0) {
        return [];
    }

    const drawn = await userQuestionCycleRepository.drawQuestionIds({
        userId: input.userId,
        difficulty: input.difficulty,
        needed: input.questionCount,
        excludeQuestionIds: input.excludeQuestionIds,
        allowPartial: true,
    });

    if (!drawn.ok || drawn.questionIds.length === 0) {
        return [];
    }

    await settleAfterPoolBeforeDirectResolve();

    return questionRepository.pickSnapshotBundleByQuestionIds(
        drawn.questionIds,
        input.locale,
    );
}
