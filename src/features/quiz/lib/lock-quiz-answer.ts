/**
 * Фиксация одного ответа: ключ ответа → id из БД → запись → исход.
 *
 * Чистая оркестрация с репозиторием через параметр: маршрут
 * `/api/quiz/:id/answer` передаёт настоящий, тесты — заглушку.
 * Наружу уходят только токены сессии (как в данных игры), не id из БД.
 *
 * Canon: docs/DECISIONS.md → Answer lock-in.
 */

import { openQuizAnswerKey } from '@/entities/quiz-session/quiz-answer-key';
import { createQuizPublicIdCodec } from '@/entities/quiz-session/quiz-public-ids';
import type {
    AnswerSessionState,
    InsertLockedAnswerInput,
    LockedAnswerRow,
} from '@/entities/quiz-session/quiz-session-answer.repository';
import { isTimedSubmitExpired } from '@/features/timed-mode/lib/is-timed-submit-expired';
import { TIMED_MODE_MVP_RULES } from '@/features/timed-mode/types';

export type LockQuizAnswerDeps = {
    insertLockedAnswer: (input: InsertLockedAnswerInput) => Promise<boolean>;
    findLockedAnswer: (
        sessionId: string,
        userId: string,
        questionId: string,
    ) => Promise<LockedAnswerRow | null>;
    findAnswerSessionState: (
        sessionId: string,
        userId: string,
    ) => Promise<AnswerSessionState | null>;
};

export type LockQuizAnswerInput = {
    sessionId: string;
    userId: string;
    questionToken: string;
    optionToken: string;
    answerKey: string;
    /** Момент прихода запроса на сервер (часы сервера, не клиента). */
    receivedAt: Date;
    /** Только для тестов; в приложении AUTH_SECRET. */
    secret?: string;
};

export type LockQuizAnswerResult =
    | {
          status: 'locked';
          /** true — ответ был записан раньше (повтор, вторая вкладка). */
          replay: boolean;
          correct: boolean;
          selectedOption: string;
          correctOption: string;
      }
    /** Подделанный / чужой ключ или токен не из этого вопроса. */
    | { status: 'invalid' }
    /** Сессия не принимает ответы: сдана, брошена, не та, Выживание. */
    | { status: 'closed' }
    /** Блиц: ответ пришёл после 00:00 + grace. */
    | { status: 'time_up' };

export async function lockQuizAnswer(
    input: LockQuizAnswerInput,
    deps: LockQuizAnswerDeps,
): Promise<LockQuizAnswerResult> {
    const key = openQuizAnswerKey(
        input.answerKey,
        input.sessionId,
        input.secret,
    );
    if (!key) {
        return { status: 'invalid' };
    }

    const codec = createQuizPublicIdCodec(input.sessionId, input.secret);
    if (codec.question(key.questionId) !== input.questionToken) {
        return { status: 'invalid' };
    }

    const selectedOptionId = key.optionIds.find(
        (optionId) => codec.option(optionId) === input.optionToken,
    );
    if (!selectedOptionId) {
        return { status: 'invalid' };
    }

    const outcome = (optionId: string, replay: boolean) =>
        ({
            status: 'locked',
            replay,
            correct: optionId === key.correctOptionId,
            selectedOption: codec.option(optionId),
            correctOption: codec.option(key.correctOptionId),
        }) as const;

    const inserted = await deps.insertLockedAnswer({
        sessionId: input.sessionId,
        userId: input.userId,
        questionId: key.questionId,
        selectedOptionId,
        isCorrect: selectedOptionId === key.correctOptionId,
        answeredAt: input.receivedAt,
        deadlineFloor: new Date(
            input.receivedAt.getTime() -
                TIMED_MODE_MVP_RULES.graceSeconds * 1000,
        ),
    });
    if (inserted) {
        return outcome(selectedOptionId, false);
    }

    // Не записали: либо ответ уже был (первый побеждает), либо сессия
    // ответов не принимает. Повтор после обрыва сети — тот же исход.
    const existing = await deps.findLockedAnswer(
        input.sessionId,
        input.userId,
        key.questionId,
    );
    if (existing && key.optionIds.includes(existing.selectedOptionId)) {
        return outcome(existing.selectedOptionId, true);
    }

    const state = await deps.findAnswerSessionState(
        input.sessionId,
        input.userId,
    );
    if (
        state?.status === 'IN_PROGRESS' &&
        !state.isSurvival &&
        isTimedSubmitExpired(state.timedEndsAt, input.receivedAt.getTime())
    ) {
        return { status: 'time_up' };
    }

    return { status: 'closed' };
}
