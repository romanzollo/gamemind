/**
 * Фиксация ответов по одному (Classic / Blitz / Daily) и их чтение для
 * продолжения партии и сдачи.
 *
 * Только скаляры и pooled-клиент, вне Direct-очереди: ни одного SELECT
 * `snapshotData` (TOAST) — правильность ответа даёт ключ ответа
 * (`quiz-answer-key.ts`). Запись — один autocommit-запрос, первый ответ
 * побеждает (`UNIQUE (sessionId, questionId)`), повтор безопасен.
 * Дедлайн Блица сравнивается с JS Date (не SQL NOW(): наивный TIMESTAMP,
 * QUIZ_NEON_HOT_PATH → E).
 *
 * Canon: docs/DECISIONS.md → Answer lock-in; QUIZ_NEON_HOT_PATH → E2.
 */

import { randomUUID } from 'node:crypto';

import { withPooledPgClient } from '@/lib/db/direct-pg';

/** Pooled-хоп ответа короткий: игрок ждёт плашку, а повтор безопасен. */
const ANSWER_HOP_TIMEOUT_MS = 8_000;

export type LockedAnswerRow = {
    questionId: string;
    selectedOptionId: string;
    isCorrect: boolean;
};

export type InsertLockedAnswerInput = {
    sessionId: string;
    userId: string;
    questionId: string;
    selectedOptionId: string;
    isCorrect: boolean;
    answeredAt: Date;
    /** Ответ Блица принимается, пока timedEndsAt позже этого момента. */
    deadlineFloor: Date;
};

export type AnswerSessionState = {
    status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
    timedEndsAt: Date | null;
    isSurvival: boolean;
};

export const quizSessionAnswerMethods = {
    /**
     * true — ответ записан этим запросом. false — уже был ответ на этот
     * вопрос, или сессия не принимает ответы (чужая, закрыта, Выживание,
     * время Блица вышло): причину уточняет вызывающий.
     */
    async insertLockedAnswer(input: InsertLockedAnswerInput): Promise<boolean> {
        const result = await withPooledPgClient(
            (client) =>
                client.query(
                    `
                        INSERT INTO "QuizAnswer" (
                            "id", "sessionId", "questionId",
                            "selectedOptionId", "isCorrect", "answeredAt"
                        )
                        SELECT $1, s."id", $3, $4, $5, $6
                        FROM "QuizSession" s
                        WHERE
                            s."id" = $2
                            AND s."userId" = $7
                            AND s."status" = 'IN_PROGRESS'::"QuizSessionStatus"
                            AND s."survivalRunId" IS NULL
                            AND (s."timedEndsAt" IS NULL OR s."timedEndsAt" > $8)
                        ON CONFLICT ("sessionId", "questionId") DO NOTHING
                        RETURNING "id"
                    `,
                    [
                        randomUUID(),
                        input.sessionId,
                        input.questionId,
                        input.selectedOptionId,
                        input.isCorrect,
                        input.answeredAt,
                        input.userId,
                        input.deadlineFloor,
                    ],
                ),
            {
                debugLabel: 'quiz.answer.lock',
                attemptTimeoutMs: ANSWER_HOP_TIMEOUT_MS,
            },
        );

        return (result.rowCount ?? 0) > 0;
    },

    /** Уже записанный ответ на вопрос этой сессии игрока (повтор / вторая вкладка). */
    async findLockedAnswer(
        sessionId: string,
        userId: string,
        questionId: string,
    ): Promise<LockedAnswerRow | null> {
        const result = await withPooledPgClient(
            (client) =>
                client.query<LockedAnswerRow>(
                    `
                        SELECT
                            a."questionId",
                            a."selectedOptionId",
                            a."isCorrect"
                        FROM "QuizAnswer" a
                        JOIN "QuizSession" s ON s."id" = a."sessionId"
                        WHERE
                            a."sessionId" = $1
                            AND a."questionId" = $3
                            AND s."userId" = $2
                    `,
                    [sessionId, userId, questionId],
                ),
            {
                debugLabel: 'quiz.answer.find',
                attemptTimeoutMs: ANSWER_HOP_TIMEOUT_MS,
            },
        );

        return result.rows[0] ?? null;
    },

    /** Почему ответ не принят: статус, дедлайн, режим. null — не та сессия. */
    async findAnswerSessionState(
        sessionId: string,
        userId: string,
    ): Promise<AnswerSessionState | null> {
        const result = await withPooledPgClient(
            (client) =>
                client.query<{
                    status: AnswerSessionState['status'];
                    timedEndsAt: Date | null;
                    isSurvival: boolean;
                }>(
                    `
                        SELECT
                            "status"::text AS "status",
                            "timedEndsAt",
                            ("survivalRunId" IS NOT NULL) AS "isSurvival"
                        FROM "QuizSession"
                        WHERE "id" = $1 AND "userId" = $2
                    `,
                    [sessionId, userId],
                ),
            {
                debugLabel: 'quiz.answer.session-state',
                attemptTimeoutMs: ANSWER_HOP_TIMEOUT_MS,
            },
        );

        return result.rows[0] ?? null;
    },

    /**
     * Все записанные ответы сессии игрока: продолжение партии после
     * обновления страницы и сдача (очки — только по ним).
     */
    async findLockedAnswers(
        sessionId: string,
        userId: string,
        debugLabel = 'quiz.answer.list',
    ): Promise<LockedAnswerRow[]> {
        const result = await withPooledPgClient(
            (client) =>
                client.query<LockedAnswerRow>(
                    `
                        SELECT
                            a."questionId",
                            a."selectedOptionId",
                            a."isCorrect"
                        FROM "QuizAnswer" a
                        JOIN "QuizSession" s ON s."id" = a."sessionId"
                        WHERE a."sessionId" = $1 AND s."userId" = $2
                    `,
                    [sessionId, userId],
                ),
            { debugLabel, attemptTimeoutMs: ANSWER_HOP_TIMEOUT_MS },
        );

        return result.rows;
    },
};
