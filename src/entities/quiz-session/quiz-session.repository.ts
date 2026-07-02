import { randomUUID } from 'node:crypto';

import { Client } from 'pg';

import type { Difficulty } from '@/types';
import { prisma, withDatabaseRetry } from '@/lib/prisma';

// тип для входных данных для создания сессии викторины
type CreateQuizSessionInput = {
    userId: string;
    difficulty: Difficulty;
    questionCount: number;
};

// один вопрос в snapshot сессии
export type SessionSnapshotQuestionInput = {
    questionId: string;
    position: number;
    options: Array<{
        optionId: string;
        displayOrder: number;
    }>;
};

// создание сессии вместе с snapshot вопросов и порядка вариантов
export type CreateQuizSessionWithSnapshotInput = CreateQuizSessionInput & {
    questions: SessionSnapshotQuestionInput[];
};

// публичный вопрос из snapshot сессии (без isCorrect)
export type SessionSnapshotPublicQuestion = {
    id: string;
    text: string;
    difficulty: Difficulty;
    options: Array<{
        id: string;
        text: string;
        order: number;
    }>;
};

// вопрос из snapshot для server-side scoring (с isCorrect, без текста)
export type SessionSnapshotScoringQuestion = {
    id: string;
    options: Array<{
        id: string;
        isCorrect: boolean;
    }>;
};

// результат одного read для submit: сессия + snapshot для scoring
export type SessionForSubmitResult =
    | { status: 'not_found' }
    | { status: 'invalid_snapshot' }
    | {
          status: 'ready';
          sessionId: string;
          questions: SessionSnapshotScoringQuestion[];
      };

type SessionSnapshotCreateResult = {
    id: string;
};

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

function getDirectDatabaseUrl() {
    const connectionString =
        process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

    if (!connectionString) {
        throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL is required');
    }

    return connectionString.replace('sslmode=require', 'sslmode=verify-full');
}

function buildValuesPlaceholder(
    rowCount: number,
    columnCount: number,
    startIndex = 1,
) {
    return Array.from({ length: rowCount }, (_, rowIndex) => {
        const columns = Array.from({ length: columnCount }, (_, columnIndex) => {
            return `$${startIndex + rowIndex * columnCount + columnIndex}`;
        });

        return `(${columns.join(', ')})`;
    }).join(', ');
}

async function createSnapshotWithPgClient(
    input: CreateQuizSessionWithSnapshotInput,
): Promise<SessionSnapshotCreateResult> {
    const client = new Client({
        connectionString: getDirectDatabaseUrl(),
        ssl: { rejectUnauthorized: true },
    });

    const sessionId = randomUUID();
    const sessionQuestionRows = input.questions.map((question) => ({
        id: randomUUID(),
        sessionId,
        questionId: question.questionId,
        position: question.position,
        options: question.options,
    }));

    const optionRows = sessionQuestionRows.flatMap((sessionQuestion) =>
        sessionQuestion.options.map((option) => ({
            id: randomUUID(),
            sessionQuestionId: sessionQuestion.id,
            optionId: option.optionId,
            displayOrder: option.displayOrder,
        })),
    );

    await client.connect();

    try {
        await client.query('BEGIN');

        await client.query(
            `
                INSERT INTO "QuizSession" (
                    "id",
                    "userId",
                    "status",
                    "difficulty",
                    "questionCount",
                    "startedAt"
                )
                VALUES ($1, $2, $3::"QuizSessionStatus", $4::"Difficulty", $5, NOW())
            `,
            [
                sessionId,
                input.userId,
                'IN_PROGRESS',
                input.difficulty,
                input.questionCount,
            ],
        );

        await client.query(
            `
                INSERT INTO "QuizSessionQuestion" (
                    "id",
                    "sessionId",
                    "questionId",
                    "position"
                )
                VALUES ${buildValuesPlaceholder(sessionQuestionRows.length, 4)}
            `,
            sessionQuestionRows.flatMap((row) => [
                row.id,
                row.sessionId,
                row.questionId,
                row.position,
            ]),
        );

        if (optionRows.length > 0) {
            await client.query(
                `
                    INSERT INTO "QuizSessionQuestionOption" (
                        "id",
                        "sessionQuestionId",
                        "optionId",
                        "displayOrder"
                    )
                    VALUES ${buildValuesPlaceholder(optionRows.length, 4)}
                `,
                optionRows.flatMap((row) => [
                    row.id,
                    row.sessionQuestionId,
                    row.optionId,
                    row.displayOrder,
                ]),
            );
        }

        await client.query('COMMIT');

        return { id: sessionId };
    } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
    } finally {
        await client.end();
    }
}

async function completeQuizSessionWithPgClient(
    input: CompleteQuizSessionWithResultInput,
): Promise<CompleteQuizSessionWithResultStatus> {
    const client = new Client({
        connectionString: getDirectDatabaseUrl(),
        ssl: { rejectUnauthorized: true },
    });

    const answerRows = input.answers.map((answer) => ({
        id: randomUUID(),
        sessionId: input.sessionId,
        questionId: answer.questionId,
        selectedOptionId: answer.selectedOptionId,
        isCorrect: answer.isCorrect,
    }));
    const resultId = randomUUID();

    await client.connect();

    try {
        await client.query('BEGIN');

        const sessionResult = await client.query<{ status: string }>(
            `
                SELECT "status"::text AS "status"
                FROM "QuizSession"
                WHERE "id" = $1 AND "userId" = $2
                FOR UPDATE
            `,
            [input.sessionId, input.userId],
        );

        const session = sessionResult.rows[0];

        if (!session) {
            await client.query('COMMIT');
            return 'not_found';
        }

        if (session.status === 'COMPLETED') {
            await client.query('COMMIT');
            return 'already_completed';
        }

        if (session.status !== 'IN_PROGRESS') {
            await client.query('COMMIT');
            return 'not_found';
        }

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
            `,
            answerRows.flatMap((row) => [
                row.id,
                row.sessionId,
                row.questionId,
                row.selectedOptionId,
                row.isCorrect,
            ]),
        );

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

        await client.query(
            `
                UPDATE "QuizSession"
                SET "status" = $1::"QuizSessionStatus", "completedAt" = NOW()
                WHERE "id" = $2
            `,
            ['COMPLETED', input.sessionId],
        );

        await client.query('COMMIT');

        return 'completed';
    } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
    } finally {
        await client.end();
    }
}

async function loadSessionForSubmit(
    sessionId: string,
    userId: string,
): Promise<SessionForSubmitResult> {
    const session = await prisma.quizSession.findFirst({
        where: {
            id: sessionId,
            userId,
            status: 'IN_PROGRESS',
        },
        select: {
            id: true,
            questionCount: true,
            sessionQuestions: {
                orderBy: { position: 'asc' },
                select: {
                    question: {
                        select: {
                            id: true,
                        },
                    },
                    options: {
                        orderBy: { displayOrder: 'asc' },
                        select: {
                            option: {
                                select: {
                                    id: true,
                                    isCorrect: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    if (!session) {
        return { status: 'not_found' };
    }

    if (session.sessionQuestions.length !== session.questionCount) {
        return { status: 'invalid_snapshot' };
    }

    return {
        status: 'ready',
        sessionId: session.id,
        questions: session.sessionQuestions.map((sessionQuestion) => ({
            id: sessionQuestion.question.id,
            options: sessionQuestion.options.map((sessionOption) => ({
                id: sessionOption.option.id,
                isCorrect: sessionOption.option.isCorrect,
            })),
        })),
    };
}

// репозиторий для работы с сессиями викторины
export const quizSessionRepository = {
    // создание сессии викторины (legacy, пока не переключим startQuizAction)
    create(input: CreateQuizSessionInput) {
        return prisma.quizSession.create({
            data: {
                userId: input.userId,
                difficulty: input.difficulty,
                questionCount: input.questionCount,
            },
        });
    },

    // создание сессии + snapshot вопросов и порядка вариантов
    createWithSnapshot(input: CreateQuizSessionWithSnapshotInput) {
        if (input.questions.length !== input.questionCount) {
            throw new Error(
                `Snapshot question count mismatch: expected ${input.questionCount}, got ${input.questions.length}`,
            );
        }

        return withDatabaseRetry(() => createSnapshotWithPgClient(input));
    },

    // поиск незавершенной сессии по ID и ID пользователя
    findInProgressByIdForUser(sessionId: string, userId: string) {
        return withDatabaseRetry(() =>
            prisma.quizSession.findFirst({
                where: {
                    id: sessionId,
                    userId,
                    status: 'IN_PROGRESS',
                },
            }),
        );
    },

    // публичные вопросы из snapshot для страницы квиза
    findSnapshotPublicQuestionsForUser(sessionId: string, userId: string) {
        return withDatabaseRetry(async () => {
            const session = await prisma.quizSession.findFirst({
                where: {
                    id: sessionId,
                    userId,
                    status: 'IN_PROGRESS',
                },
                select: {
                    questionCount: true,
                    sessionQuestions: {
                        orderBy: { position: 'asc' },
                        select: {
                            question: {
                                select: {
                                    id: true,
                                    text: true,
                                    difficulty: true,
                                },
                            },
                            options: {
                                orderBy: { displayOrder: 'asc' },
                                select: {
                                    displayOrder: true,
                                    option: {
                                        select: {
                                            id: true,
                                            text: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            });

            if (!session) {
                return null;
            }

            if (session.sessionQuestions.length !== session.questionCount) {
                return null;
            }

            return session.sessionQuestions.map((sessionQuestion) => ({
                id: sessionQuestion.question.id,
                text: sessionQuestion.question.text,
                difficulty: sessionQuestion.question.difficulty,
                options: sessionQuestion.options.map((sessionOption) => ({
                    id: sessionOption.option.id,
                    text: sessionOption.option.text,
                    order: sessionOption.displayOrder,
                })),
            }));
        });
    },

    // вопросы из snapshot для server-side scoring
    findSnapshotForScoring(sessionId: string, userId: string) {
        return withDatabaseRetry(async () => {
            const result = await loadSessionForSubmit(sessionId, userId);

            if (result.status !== 'ready') {
                return null;
            }

            return result.questions;
        });
    },

    // одна read-операция для submit: проверка сессии + snapshot для scoring
    findSessionForSubmit(sessionId: string, userId: string) {
        return withDatabaseRetry(() =>
            loadSessionForSubmit(sessionId, userId),
        );
    },

    // завершение сессии викторины
    complete(sessionId: string) {
        return prisma.quizSession.update({
            where: { id: sessionId },
            data: {
                status: 'COMPLETED',
                completedAt: new Date(),
            },
        });
    },

    // атомарное сохранение ответов, результата и завершение сессии
    completeWithResult(input: CompleteQuizSessionWithResultInput) {
        return withDatabaseRetry(() => completeQuizSessionWithPgClient(input));
    },
};
