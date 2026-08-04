/**
 * QuizSession submit: answers + result + COMPLETED (Neon direct pg).
 *
 * Зачем отдельный модуль (§11.7): write-path завершения не должен жить
 * в одном файле со start/reads.
 * Правила Neon: autocommit, ON CONFLICT idempotent, recovery после transient,
 * cleanup partial answers/result; не BEGIN/COMMIT; не await client.end().
 * Scoring math остаётся в features — сюда уже готовые score/isCorrect.
 *
 * Result incident (Aug 4): reviewSnapshot копируется SQL-ом
 * `INSERT…SELECT s.snapshotData` — НЕ читать TOAST в Node (это давало
 * connect-OK / operation~19s / Connection terminated на Windows+Neon).
 * Outbox на том же write-client. Result page читает reviewSnapshot.
 *
 * Публичный фасад: quiz-session.repository.ts.
 * См. docs/DECISIONS.md → Repository File Split / Neon Write Path.
 */

import { randomUUID } from 'node:crypto';

import {
    isTransientDirectPgError,
    withDirectPgClient,
    withDirectPgWriteClient,
} from '@/lib/db/direct-pg';
import { prisma } from '@/lib/prisma';

type CompleteQuizAnswerInput = {
    questionId: string;
    selectedOptionId: string;
    isCorrect: boolean;
};

type CompleteQuizSessionWithResultInput = {
    sessionId: string;
    userId: string;
    score: number;
    totalQuestions: number;
    correctCount: number;
    answers: CompleteQuizAnswerInput[];
};

type CompleteQuizSessionWithResultStatus =
    | 'completed'
    | 'already_completed'
    | 'not_found';

function buildValuesPlaceholder(
    rowCount: number,
    columnCount: number,
    startIndex = 1,
) {
    return Array.from({ length: rowCount }, (_, rowIndex) => {
        const columns = Array.from(
            { length: columnCount },
            (_, columnIndex) => {
                return `$${startIndex + rowIndex * columnCount + columnIndex}`;
            },
        );

        return `(${columns.join(', ')})`;
    }).join(', ');
}

async function recoverSubmitStatusAfterWriteError(
    sessionId: string,
    userId: string,
    error: unknown,
): Promise<CompleteQuizSessionWithResultStatus | null> {
    if (!isTransientDirectPgError(error)) {
        return null;
    }

    const result = await withDirectPgClient((client) =>
        client.query<{ status: string }>(
            `
                SELECT "status"::text AS "status"
                FROM "QuizSession"
                WHERE "id" = $1 AND "userId" = $2
            `,
            [sessionId, userId],
        ),
    );

    const session = result.rows[0];

    if (!session) {
        return null;
    }

    if (session.status === 'COMPLETED') {
        return 'already_completed';
    }

    return null;
}

async function cleanupQuizSubmitPartial(sessionId: string) {
    await withDirectPgWriteClient(async (client) => {
        await client.query('DELETE FROM "QuizResult" WHERE "sessionId" = $1', [
            sessionId,
        ]);
        await client.query('DELETE FROM "QuizAnswer" WHERE "sessionId" = $1', [
            sessionId,
        ]);
        await client.query(
            'DELETE FROM "AchievementOutbox" WHERE "sessionId" = $1',
            [sessionId],
        );
    }).catch(() => undefined);
}

async function completeQuizSessionWithPgClient(
    input: CompleteQuizSessionWithResultInput,
): Promise<CompleteQuizSessionWithResultStatus> {
    const answerRows = input.answers.map((answer) => ({
        id: randomUUID(),
        sessionId: input.sessionId,
        questionId: answer.questionId,
        selectedOptionId: answer.selectedOptionId,
        isCorrect: answer.isCorrect,
    }));
    const resultId = randomUUID();
    const outboxId = randomUUID();

    try {
        return await withDirectPgWriteClient(
            async (client) => {
                // Только status — без snapshotData (TOAST в Node клинит write ~19s).
                const sessionResult = await client.query<{ status: string }>(
                    `
                SELECT "status"::text AS "status"
                FROM "QuizSession"
                WHERE "id" = $1 AND "userId" = $2
            `,
                    [input.sessionId, input.userId],
                );

                const session = sessionResult.rows[0];

                if (!session) {
                    return 'not_found';
                }

                if (session.status === 'COMPLETED') {
                    return 'already_completed';
                }

                if (session.status !== 'IN_PROGRESS') {
                    return 'not_found';
                }

                if (answerRows.length > 0) {
                    await client.query(
                        `
                    INSERT INTO "QuizAnswer" (
                        "id",
                        "sessionId",
                        "questionId",
                        "selectedOptionId",
                        "isCorrect"
                    )
                    VALUES ${buildValuesPlaceholder(answerRows.length, 5)}
                    ON CONFLICT ("sessionId", "questionId") DO NOTHING
                `,
                        answerRows.flatMap((row) => [
                            row.id,
                            row.sessionId,
                            row.questionId,
                            row.selectedOptionId,
                            row.isCorrect,
                        ]),
                    );
                }

                // reviewSnapshot: server-side copy TOAST, без передачи JSON в Node.
                await client.query(
                    `
                INSERT INTO "QuizResult" (
                    "id",
                    "sessionId",
                    "userId",
                    "score",
                    "totalQuestions",
                    "correctCount",
                    "reviewSnapshot"
                )
                SELECT
                    $1,
                    s."id",
                    s."userId",
                    $2,
                    $3,
                    $4,
                    s."snapshotData"
                FROM "QuizSession" AS s
                WHERE
                    s."id" = $5
                    AND s."userId" = $6
                ON CONFLICT ("sessionId") DO NOTHING
            `,
                    [
                        resultId,
                        input.score,
                        input.totalQuestions,
                        input.correctCount,
                        input.sessionId,
                        input.userId,
                    ],
                );

                const updateResult = await client.query(
                    `
                UPDATE "QuizSession"
                SET "status" = $1::"QuizSessionStatus", "completedAt" = NOW()
                WHERE
                    "id" = $2
                    AND "userId" = $3
                    AND "status" = 'IN_PROGRESS'::"QuizSessionStatus"
                RETURNING "id"
            `,
                    ['COMPLETED', input.sessionId, input.userId],
                );

                if (updateResult.rowCount === 0) {
                    return 'already_completed';
                }

                await client.query(
                    `
                INSERT INTO "AchievementOutbox" (
                    "id",
                    "userId",
                    "sessionId"
                )
                VALUES ($1, $2, $3)
                ON CONFLICT ("sessionId") DO NOTHING
            `,
                    [outboxId, input.userId, input.sessionId],
                );

                return 'completed';
            },
            {
                debugLabel: 'quiz.submit.complete',
            },
        );
    } catch (error) {
        const recovered = await recoverSubmitStatusAfterWriteError(
            input.sessionId,
            input.userId,
            error,
        );

        if (recovered) {
            return recovered;
        }

        await cleanupQuizSubmitPartial(input.sessionId);

        throw error;
    }
}

/** Методы submit для thin facade quizSessionRepository. */
export const quizSessionSubmitMethods = {
    complete(sessionId: string) {
        return prisma.quizSession.update({
            where: { id: sessionId },
            data: {
                status: 'COMPLETED',
                completedAt: new Date(),
            },
        });
    },

    completeWithResult(input: CompleteQuizSessionWithResultInput) {
        return completeQuizSessionWithPgClient(input);
    },
};
