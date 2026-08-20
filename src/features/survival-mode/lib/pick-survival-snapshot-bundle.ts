/**
 * Survival pick: published pool difficulty минус seen(run), shuffle, limit N.
 *
 * Один path для волны 1 (exclude=[]) и continue. Не UserQuestionCycle —
 * cycle даёт повторы внутри SurvivalRun. Classic/Timed cycle не трогаем.
 *
 * Hop: pooled id SELECT → 300ms settle → Direct resolve-by-ids (chunk 5).
 * Canon: docs/DECISIONS.md → Survival Mode MVP (wave 2+);
 * QUIZ_NEON_HOT_PATH.md.
 */

import { questionRepository } from '@/entities/question/question.repository';
import type { QuestionSnapshotBundleItem } from '@/entities/question/question.types';
import { withPooledPgClient } from '@/lib/db/direct-pg';
import type { Locale } from '@/shared/i18n';
import { shuffleArray } from '@/shared/utils';
import type { Difficulty } from '@/types';

/** Как Classic/Timed: после pooled нельзя сразу открывать Direct resolve. */
const AFTER_POOL_RESOLVE_SETTLE_MS = 300;

export type PickSurvivalSnapshotBundleInput = {
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

async function loadUnseenPublishedQuestionIds(input: {
    difficulty: Difficulty;
    excludeQuestionIds: string[];
    limit: number;
}): Promise<string[]> {
    if (input.limit <= 0) {
        return [];
    }

    return withPooledPgClient(
        async (client) => {
            const exclude = Array.from(
                new Set(input.excludeQuestionIds.filter((id) => id.length > 0)),
            );

            const result = await client.query<{ id: string }>(
                `
                    SELECT q."id"
                    FROM "Question" q
                    WHERE
                        q."difficulty" = $1::"Difficulty"
                        AND q."isActive" = true
                        AND q."publicationStatus" = 'PUBLISHED'::"QuestionPublicationStatus"
                        AND (
                            CARDINALITY($2::text[]) = 0
                            OR NOT (q."id" = ANY ($2::text[]))
                        )
                `,
                [input.difficulty, exclude],
            );

            const shuffled = shuffleArray(result.rows.map((row) => row.id));
            return shuffled.slice(0, input.limit);
        },
        {
            debugLabel: 'survival.pick.unseen-ids',
            attemptTimeoutMs: 12_000,
        },
    );
}

/**
 * До `questionCount` ids (короткая последняя волна 1..11 OK).
 * Пустой массив = pool exhausted / 0 unseen. Не silent random fallback.
 */
export async function pickSurvivalSnapshotBundle(
    input: PickSurvivalSnapshotBundleInput,
): Promise<QuestionSnapshotBundleItem[]> {
    const questionIds = await loadUnseenPublishedQuestionIds({
        difficulty: input.difficulty,
        excludeQuestionIds: input.excludeQuestionIds,
        limit: input.questionCount,
    });

    if (questionIds.length === 0) {
        return [];
    }

    await settleAfterPoolBeforeDirectResolve();

    return questionRepository.pickSnapshotBundleByQuestionIds(
        questionIds,
        input.locale,
    );
}
