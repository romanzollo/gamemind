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
 * `includeAudio: false` («Музыкальные вопросы» выключены): аудиовопросы
 * исключаются в том же cycle hop (cycle-pool.ts), resolve не меняется.
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

export type PickQuizSnapshotBundleInput = {
    userId: string;
    difficulty: Difficulty;
    questionCount: number;
    locale: Locale;
    /** Тема игры; null — весь банк. */
    topicTagId: string | null;
    /** «Музыкальные вопросы» устройства; false — без AUDIO_GUESS. */
    includeAudio: boolean;
};

async function pickUserCycleSnapshotBundle(
    input: PickQuizSnapshotBundleInput,
): Promise<QuestionSnapshotBundleItem[]> {
    const drawn = await userQuestionCycleRepository.drawQuestionIds({
        userId: input.userId,
        difficulty: input.difficulty,
        needed: input.questionCount,
        topicTagId: input.topicTagId,
        includeAudio: input.includeAudio,
    });

    if (!drawn.ok || drawn.questionIds.length < input.questionCount) {
        return [];
    }

    await settleAfterCycleBeforeDirectResolve();

    return questionRepository.pickSnapshotBundleByQuestionIds(
        drawn.questionIds,
        input.locale,
    );
}

/**
 * Classic lobby/rematch pick (анти-повтор по difficulty).
 * Матрица: Easy 3 → 5 → 10; rematch без повторов до исчерпания цикла.
 */
export function pickClassicSnapshotBundle(
    input: PickQuizSnapshotBundleInput,
): Promise<QuestionSnapshotBundleItem[]> {
    return pickUserCycleSnapshotBundle(input);
}

/**
 * Blitz/Timed pick (тот же мешок difficulty, что Classic).
 */
export function pickTimedSnapshotBundle(
    input: PickQuizSnapshotBundleInput,
): Promise<QuestionSnapshotBundleItem[]> {
    return pickUserCycleSnapshotBundle(input);
}

/**
 * Mix Classic/Blitz: три cycle-draw + один shuffle + один resolve.
 * Пустой массив = NOT_ENOUGH, не random.
 */
export async function pickMixedSnapshotBundle(
    input: Omit<PickQuizSnapshotBundleInput, 'difficulty'>,
): Promise<QuestionSnapshotBundleItem[]> {
    const split = getMixedDifficultySplit(input.questionCount);

    if (!split) {
        return [];
    }

    const drawn = await userQuestionCycleRepository.drawMixedQuestionIds({
        userId: input.userId,
        topicTagId: input.topicTagId,
        draws: listMixedCycleDraws(split),
        includeAudio: input.includeAudio,
    });

    if (!drawn.ok || drawn.questionIds.length < input.questionCount) {
        return [];
    }

    const sessionOrderIds = shuffleArray(drawn.questionIds);

    await settleAfterCycleBeforeDirectResolve();

    return questionRepository.pickSnapshotBundleByQuestionIds(
        sessionOrderIds,
        input.locale,
    );
}
