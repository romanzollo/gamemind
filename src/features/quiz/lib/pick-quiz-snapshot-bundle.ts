/**
 * Mode-specific snapshot pick wrappers (Classic / Timed).
 *
 * Classic + Timed: UserQuestionCycle (pooled) → resolve by ids (Direct chunks).
 * Daily Challenge сюда не ходит — frozen ids дня.
 *
 * Cycle специально НЕ на Direct queue: иначе 18s timeout + fallback = start ~40s.
 * Если pooled cycle не уложился в budget — сразу legacy random pick.
 *
 * Canon: docs/DECISIONS.md → Quiz Start / Session Load Playbook + QUIZ_NEON_HOT_PATH.
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
}

/**
 * Classic lobby/rematch pick (анти-повтор по difficulty).
 * Матрица: Easy 3 → 5 → 10 без DB_TIMEOUT; start не ~40s.
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
 * Матрица: старт 303, timedEndsAt после create, result после submit.
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
