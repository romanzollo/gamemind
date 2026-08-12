/**
 * Mode-specific snapshot pick wrappers (Classic / Timed).
 *
 * Classic + Timed: UserQuestionCycle shuffle-bag → resolve by ids (chunks of 5).
 * Daily Challenge сюда не ходит — у него frozen ids дня.
 *
 * Зачем отдельные функции при общем cycle helper:
 * - правка «под Classic 10Q» не выглядит как бесплатный side-effect на Blitz;
 * - в review видно контракт режима + матрицу проверки.
 *
 * Canon: docs/DECISIONS.md → Quiz Start / Session Load Playbook.
 * Менять pick / chunk / Direct — только с матрицей Classic 3/5/10 + Blitz 10 + Daily.
 */

import { questionRepository } from '@/entities/question/question.repository';
import type { QuestionSnapshotBundleItem } from '@/entities/question/question.types';
import { userQuestionCycleRepository } from '@/entities/user-question-cycle/user-question-cycle.repository';
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
