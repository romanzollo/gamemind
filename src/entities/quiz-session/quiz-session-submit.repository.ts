/**
 * QuizSession submit: answers + result + COMPLETED (Neon direct pg).
 *
 * Зачем отдельный модуль (§11.7): write-path завершения не должен жить
 * в одном файле со start/reads. SQL перенесён as-is — без rewrite.
 * Правила Neon: autocommit, ON CONFLICT idempotent, recovery после transient,
 * cleanup partial answers/result; не BEGIN/COMMIT; не await client.end().
 * Scoring math остаётся в features — сюда уже готовые score/isCorrect.
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

    try {
        return await withDirectPgWriteClient(async (client) => {
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

            await client.query(
                `
                INSERT INTO "QuizResult" (
                    "id",
                    "sessionId",
                    "userId",
                    "score",
                    "totalQuestions",
                    "correctCount"
                )
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT ("sessionId") DO NOTHING
            `,
                [
                    resultId,
                    input.sessionId,
                    input.userId,
                    input.score,
                    input.totalQuestions,
                    input.correctCount,
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

            return 'completed';
        });
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
