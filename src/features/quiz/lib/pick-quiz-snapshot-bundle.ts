/**
 * Mode-specific snapshot pick wrappers (Classic / Timed).
 *
 * Classic + Timed: seeded UserQuestionCycle (raw pg scalars) → resolve by ids.
 * Daily Challenge сюда не ходит — frozen ids дня.
 *
 * Mix: 3× существующие мешки (`withPooledPgClient`, вне Direct queue) → shuffle →
 * settle 300ms → один resolve-by-ids (chunk 5). Не MIXED в Difficulty.
 * SINGLE Classic/Blitz: тот же settle после cycle перед Direct resolve.
 *
 * Тема игры (`topicTagId`): мешки темы в том же cycle hop; дальше всё как
 * без темы (settle, resolve chunk 5). Survival и Daily тему не передают.
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
import {
    getMixedDifficultySplit,
    listMixedCycleDraws,
} from '@/features/quiz/lib/mixed-difficulty-split';
import type { Locale } from '@/shared/i18n';
import { shuffleArray } from '@/shared/utils';
import type { Difficulty } from '@/types';

/**
 * Как `DIRECT_PG_SETTLE_MS` в direct-pg: после pooled cycle нельзя сразу
 * открывать unpooled resolve. Измерено на Mix 10; тот же зазор нужен
 * Classic/Blitz SINGLE 10 (иначе 4-й Direct hop клинит play-load).
 */
const AFTER_CYCLE_RESOLVE_SETTLE_MS = 300;

async function settleAfterCycleBeforeDirectResolve() {
    await new Promise((resolve) =>
        setTimeout(resolve, AFTER_CYCLE_RESOLVE_SETTLE_MS),
    );
}

async function pickUserCycleSnapshotBundle(
    userId: string,
    difficulty: Difficulty,
    questionCount: number,
    locale: Locale,
    topicTagId: string | null,
): Promise<QuestionSnapshotBundleItem[]> {
    const drawn = await userQuestionCycleRepository.drawQuestionIds({
        userId,
        difficulty,
        needed: questionCount,
        topicTagId,
    });

    if (!drawn.ok || drawn.questionIds.length < questionCount) {
        return [];
    }

    await settleAfterCycleBeforeDirectResolve();

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
    topicTagId: string | null,
): Promise<QuestionSnapshotBundleItem[]> {
    return pickUserCycleSnapshotBundle(
        userId,
        difficulty,
        questionCount,
        locale,
        topicTagId,
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
    topicTagId: string | null,
): Promise<QuestionSnapshotBundleItem[]> {
    return pickUserCycleSnapshotBundle(
        userId,
        difficulty,
        questionCount,
        locale,
        topicTagId,
    );
}

/**
 * Mix Classic/Blitz: три cycle-draw + один shuffle + один resolve.
 * Пустой массив = NOT_ENOUGH, не random.
 */
export async function pickMixedSnapshotBundle(
    userId: string,
    questionCount: number,
    locale: Locale,
    topicTagId: string | null,
): Promise<QuestionSnapshotBundleItem[]> {
    const split = getMixedDifficultySplit(questionCount);

    if (!split) {
        return [];
    }

    const drawn = await userQuestionCycleRepository.drawMixedQuestionIds({
        userId,
        topicTagId,
        draws: listMixedCycleDraws(split),
    });

    if (!drawn.ok || drawn.questionIds.length < questionCount) {
        return [];
    }

    const sessionOrderIds = shuffleArray(drawn.questionIds);

    await settleAfterCycleBeforeDirectResolve();

    return questionRepository.pickSnapshotBundleByQuestionIds(
        sessionOrderIds,
        locale,
    );
}
