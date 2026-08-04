/**
 * QuizSession submit: answers + result + COMPLETED (Neon direct pg).
 *
 * Зачем отдельный модуль (§11.7): write-path завершения не должен жить
 * в одном файле со start/reads.
 * Правила Neon: autocommit, ON CONFLICT idempotent, recovery после transient,
 * cleanup partial answers/result; не BEGIN/COMMIT; не await client.end().
 *
 * Critical path (Aug 4 senior fix): ТОЛЬКО скаляры на QuizResult.
 * Не писать reviewSnapshot/reviewPayload в том же hop — Node→JSONB и/или
 * SELECT s.snapshotData клинили complete ~19s (Connection terminated) на
 * Windows+Neon next-dev. Slim reviewPayload — отдельный best-effort hop
 * после успешного complete (ошибка не валит submit).
 *
 * Публичный фасад: quiz-session.repository.ts.
 * См. docs/DECISIONS.md → Quiz Start / Session Load Playbook.
 */

import { randomUUID } from 'node:crypto';

import {
    isTransientDirectPgError,
    withDirectPgClient,
    withDirectPgWriteClient,
} from '@/lib/db/direct-pg';
import { prisma } from '@/lib/prisma';
import type { CompactReviewPayloadV1 } from '@/entities/quiz-result/compact-review-payload';

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
    /** Slim bilingual review — пишется после complete, не блокирует submit. */
    reviewPayload?: CompactReviewPayloadV1 | null;
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
        client.query<{ status: string; has_result: boolean }>(
            `
                SELECT
                    s."status"::text AS "status",
                    EXISTS (
                        SELECT 1 FROM "QuizResult" r WHERE r."sessionId" = s."id"
                    ) AS "has_result"
                FROM "QuizSession" s
                WHERE s."id" = $1 AND s."userId" = $2
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

    // Partial: result есть, status ещё IN_PROGRESS — дожимаем COMPLETED.
    if (session.has_result && session.status === 'IN_PROGRESS') {
        try {
            await withDirectPgWriteClient(
                async (client) => {
                    await client.query(
                        `
                        UPDATE "QuizSession"
                        SET "status" = 'COMPLETED'::"QuizSessionStatus",
                            "completedAt" = COALESCE("completedAt", NOW())
                        WHERE "id" = $1
                          AND "userId" = $2
                          AND "status" = 'IN_PROGRESS'::"QuizSessionStatus"
                    `,
                        [sessionId, userId],
                    );
                    await client.query(
                        `
                        INSERT INTO "AchievementOutbox" ("id", "userId", "sessionId")
                        VALUES ($1, $2, $3)
                        ON CONFLICT ("sessionId") DO NOTHING
                    `,
                        [randomUUID(), userId, sessionId],
                    );
                },
                { debugLabel: 'quiz.submit.recover-complete' },
            );
            return 'completed';
        } catch {
            return null;
        }
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

/**
 * Best-effort: slim review после успешного complete.
 * Не бросает наружу — разбор может soft-fail, score уже сохранён.
 */
async function attachReviewPayloadBestEffort(
    sessionId: string,
    userId: string,
    reviewPayload: CompactReviewPayloadV1,
) {
    try {
        await withDirectPgWriteClient(
            async (client) => {
                await client.query(
                    `
                    UPDATE "QuizResult"
                    SET "reviewPayload" = $1::jsonb
                    WHERE "sessionId" = $2 AND "userId" = $3
                `,
                    [JSON.stringify(reviewPayload), sessionId, userId],
                );
            },
            { debugLabel: 'quiz.submit.review-payload' },
        );
    } catch (error) {
        console.error(
            'Quiz reviewPayload attach failed (non-fatal):',
            error,
        );
    }
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
        const status = await withDirectPgWriteClient(
            async (client) => {
                // Только status — без snapshotData (TOAST в Node клинит).
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

                // Только скаляры — без JSONB. VALUES, без SELECT snapshotData.
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

        if (
            (status === 'completed' || status === 'already_completed') &&
            input.reviewPayload
        ) {
            // Не await: Node→JSONB может клинить ~19s; submit/redirect не ждут.
            void attachReviewPayloadBestEffort(
                input.sessionId,
                input.userId,
                input.reviewPayload,
            );
        }

        return status;
    } catch (error) {
        const recovered = await recoverSubmitStatusAfterWriteError(
            input.sessionId,
            input.userId,
            error,
        );

        if (recovered) {
            if (recovered === 'completed' && input.reviewPayload) {
                void attachReviewPayloadBestEffort(
                    input.sessionId,
                    input.userId,
                    input.reviewPayload,
                );
            }
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
