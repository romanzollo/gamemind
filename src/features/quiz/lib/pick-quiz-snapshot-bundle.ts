/**
 * Mode-specific snapshot pick wrappers (Classic / Timed).
 *
 * Classic + Timed: UserQuestionCycle shuffle-bag → resolve by ids (chunks of 5).
 * Daily Challenge сюда не ходит — у него frozen ids дня.
 *
 * Если cycle Direct hop падает transient (Windows+Neon Connection terminated),
 * fallback на legacy random pick — квиз не должен быть «полностью сломан»,
 * анти-повтор best-effort. См. QUIZ_NEON_HOT_PATH.
 *
 * Canon: docs/DECISIONS.md → Quiz Start / Session Load Playbook.
 */

import { questionRepository } from '@/entities/question/question.repository';
import type { QuestionSnapshotBundleItem } from '@/entities/question/question.types';
import { userQuestionCycleRepository } from '@/entities/user-question-cycle/user-question-cycle.repository';
import {
    isDirectPgTimeoutError,
    isTransientDirectPgError,
} from '@/lib/db/direct-pg';
import type { Locale } from '@/shared/i18n';
import type { Difficulty } from '@/types';

/**
 * Cycle draw + chunked resolve. Пустой массив = NOT_ENOUGH_QUESTIONS наверху.
 * Не списывает Daily ids; submit не вызывает.
 */
async function pickUserCycleSnapshotBundle(
    userId: string,
    difficulty: Difficulty,
    questionCount: number,
    locale: Locale,
): Promise<QuestionSnapshotBundleItem[]> {
    try {
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
    } catch (error) {
        // Не клинить старт из-за мешка: очередь Direct важнее анти-повтора.
        if (
            isTransientDirectPgError(error) ||
            isDirectPgTimeoutError(error)
        ) {
            console.warn(
                'UserQuestionCycle draw failed; falling back to random pick',
                error instanceof Error ? error.message : error,
            );

            return questionRepository.pickRandomActiveSnapshotBundle(
                difficulty,
                questionCount,
                locale,
            );
        }

        throw error;
    }
}

/**
 * Classic lobby/rematch pick (анти-повтор по difficulty).
 * Матрица: Easy 3 → 5 → 10 без DB_TIMEOUT.
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
 * Blitz/Timed pick (всегда 10Q по MVP rules; тот же мешок difficulty, что Classic).
 * Матрица: старт 303, timedEndsAt ≈ now+60s после create, result после submit.
 * Не «ускорять Classic» правкой этого wrapper без прогона Blitz.
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
