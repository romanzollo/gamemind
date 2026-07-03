import { randomUUID } from 'node:crypto';

import type { Client } from 'pg';

import type { Difficulty } from '@/types';
import type { Locale } from '@/shared/i18n';
import { prisma, withDatabaseRetry } from '@/lib/prisma';
import {
    isTransientDirectPgError,
    withDirectPgClient,
    withDirectPgWriteClient,
} from '@/lib/db/direct-pg';

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
    displayText: string;
    options: Array<{
        optionId: string;
        displayOrder: number;
        displayText: string;
    }>;
};

// создание сессии вместе с snapshot вопросов и порядка вариантов
export type CreateQuizSessionWithSnapshotInput = CreateQuizSessionInput & {
    sessionLocale: Locale;
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

type SnapshotPublicRow = {
    session_id: string;
    question_count: number;
    question_id: string | null;
    question_text: string | null;
    difficulty: Difficulty | null;
    option_id: string | null;
    option_text: string | null;
    display_order: number | null;
};

type SnapshotScoringRow = {
    session_id: string;
    question_count: number;
    question_id: string | null;
    option_id: string | null;
    is_correct: boolean | null;
};

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

async function isSnapshotComplete(
    sessionId: string,
    expectedQuestionCount: number,
    expectedOptionCount: number,
) {
    const result = await withDirectPgClient((client) =>
        client.query<{
            question_count: number;
            option_count: number;
        }>(
            `
                SELECT
                    COUNT(DISTINCT ssq."id")::int AS "question_count",
                    COUNT(ssqo."id")::int AS "option_count"
                FROM "QuizSession" s
                LEFT JOIN "QuizSessionQuestion" ssq
                    ON ssq."sessionId" = s."id"
                LEFT JOIN "QuizSessionQuestionOption" ssqo
                    ON ssqo."sessionQuestionId" = ssq."id"
                WHERE s."id" = $1
            `,
            [sessionId],
        ),
    );

    const row = result.rows[0];

    return (
        row?.question_count === expectedQuestionCount &&
        row.option_count === expectedOptionCount
    );
}

async function cleanupQuizSessionById(sessionId: string) {
    await withDirectPgWriteClient((client) =>
        client.query('DELETE FROM "QuizSession" WHERE "id" = $1', [sessionId]),
    ).catch(() => undefined);
}

function assertSnapshotDisplayTexts(input: CreateQuizSessionWithSnapshotInput) {
    for (const question of input.questions) {
        if (!question.displayText.trim()) {
            throw new Error(
                `Missing displayText for question ${question.questionId}`,
            );
        }

        for (const option of question.options) {
            if (!option.displayText.trim()) {
                throw new Error(
                    `Missing displayText for option ${option.optionId}`,
                );
            }
        }
    }
}

async function insertSnapshotRows(
    client: Client,
    sessionId: string,
    input: CreateQuizSessionWithSnapshotInput,
) {
    const sessionQuestionRows = input.questions.map((question) => ({
        id: randomUUID(),
        sessionId,
        questionId: question.questionId,
        position: question.position,
        displayText: question.displayText,
        options: question.options,
    }));

    const optionRows = sessionQuestionRows.flatMap((sessionQuestion) =>
        sessionQuestion.options.map((option) => ({
            id: randomUUID(),
            sessionQuestionId: sessionQuestion.id,
            optionId: option.optionId,
            displayOrder: option.displayOrder,
            displayText: option.displayText,
        })),
    );

    await client.query(
        `
            INSERT INTO "QuizSession" (
                "id",
                "userId",
                "status",
                "difficulty",
                "questionCount",
                "sessionLocale",
                "startedAt"
            )
            VALUES (
                $1,
                $2,
                $3::"QuizSessionStatus",
                $4::"Difficulty",
                $5,
                $6::"ContentLocale",
                NOW()
            )
        `,
        [
            sessionId,
            input.userId,
            'IN_PROGRESS',
            input.difficulty,
            input.questionCount,
            input.sessionLocale,
        ],
    );

    await client.query(
        `
            INSERT INTO "QuizSessionQuestion" (
                "id",
                "sessionId",
                "questionId",
                "position",
                "displayText"
            )
            VALUES ${buildValuesPlaceholder(sessionQuestionRows.length, 5)}
        `,
        sessionQuestionRows.flatMap((row) => [
            row.id,
            row.sessionId,
            row.questionId,
            row.position,
            row.displayText,
        ]),
    );

    if (optionRows.length > 0) {
        await client.query(
            `
                INSERT INTO "QuizSessionQuestionOption" (
                    "id",
                    "sessionQuestionId",
                    "optionId",
                    "displayOrder",
                    "displayText"
                )
                VALUES ${buildValuesPlaceholder(optionRows.length, 5)}
            `,
            optionRows.flatMap((row) => [
                row.id,
                row.sessionQuestionId,
                row.optionId,
                row.displayOrder,
                row.displayText,
            ]),
        );
    }
}

async function createSnapshotWithPgClient(
    input: CreateQuizSessionWithSnapshotInput,
): Promise<SessionSnapshotCreateResult> {
    assertSnapshotDisplayTexts(input);

    const expectedOptionCount = input.questions.reduce(
        (total, question) => total + question.options.length,
        0,
    );

    for (let attempt = 1; attempt <= 2; attempt += 1) {
        const sessionId = randomUUID();

        try {
            await withDirectPgWriteClient(async (client) => {
                await insertSnapshotRows(client, sessionId, input);
            });

            return { id: sessionId };
        } catch (error) {
            const recovered =
                isTransientDirectPgError(error) &&
                (await isSnapshotComplete(
                    sessionId,
                    input.questionCount,
                    expectedOptionCount,
                ).catch(() => false));

            if (recovered) {
                return { id: sessionId };
            }

            await cleanupQuizSessionById(sessionId);

            if (!isTransientDirectPgError(error) || attempt === 2) {
                throw error;
            }
        }
    }

    throw new Error('Quiz session snapshot create retry exhausted');
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

async function loadSessionForSubmit(
    sessionId: string,
    userId: string,
): Promise<SessionForSubmitResult> {
    const result = await withDirectPgClient((client) => {
        return client.query<SnapshotScoringRow>(
            `
                SELECT
                    s."id" AS "session_id",
                    s."questionCount" AS "question_count",
                    q."id" AS "question_id",
                    ao."id" AS "option_id",
                    ao."isCorrect" AS "is_correct"
                FROM "QuizSession" s
                LEFT JOIN "QuizSessionQuestion" ssq
                    ON ssq."sessionId" = s."id"
                LEFT JOIN "Question" q
                    ON q."id" = ssq."questionId"
                LEFT JOIN "QuizSessionQuestionOption" ssqo
                    ON ssqo."sessionQuestionId" = ssq."id"
                LEFT JOIN "AnswerOption" ao
                    ON ao."id" = ssqo."optionId"
                WHERE
                    s."id" = $1
                    AND s."userId" = $2
                    AND s."status" = 'IN_PROGRESS'::"QuizSessionStatus"
                ORDER BY ssq."position" ASC, ssqo."displayOrder" ASC
            `,
            [sessionId, userId],
        );
    });

    if (result.rows.length === 0) {
        return { status: 'not_found' };
    }

    const firstRow = result.rows[0];
    const questions = new Map<string, SessionSnapshotScoringQuestion>();

    for (const row of result.rows) {
        if (!row.question_id || !row.option_id || row.is_correct === null) {
            return { status: 'invalid_snapshot' };
        }

        const existing = questions.get(row.question_id);

        if (existing) {
            existing.options.push({
                id: row.option_id,
                isCorrect: row.is_correct,
            });
        } else {
            questions.set(row.question_id, {
                id: row.question_id,
                options: [{ id: row.option_id, isCorrect: row.is_correct }],
            });
        }
    }

    if (questions.size !== firstRow.question_count) {
        return { status: 'invalid_snapshot' };
    }

    return {
        status: 'ready',
        sessionId: firstRow.session_id,
        questions: Array.from(questions.values()),
    };
}

async function loadSnapshotPublicQuestions(
    sessionId: string,
    userId: string,
): Promise<SessionSnapshotPublicQuestion[] | null> {
    const result = await withDirectPgClient((client) => {
        return client.query<SnapshotPublicRow>(
            `
                SELECT
                    s."id" AS "session_id",
                    s."questionCount" AS "question_count",
                    q."id" AS "question_id",
                    COALESCE(
                        ssq."displayText",
                        qt_session."text",
                        qt_ru."text",
                        q."text"
                    ) AS "question_text",
                    q."difficulty"::text AS "difficulty",
                    ao."id" AS "option_id",
                    COALESCE(
                        ssqo."displayText",
                        aot_session."text",
                        aot_ru."text",
                        ao."text"
                    ) AS "option_text",
                    ssqo."displayOrder" AS "display_order"
                FROM "QuizSession" s
                LEFT JOIN "QuizSessionQuestion" ssq
                    ON ssq."sessionId" = s."id"
                LEFT JOIN "Question" q
                    ON q."id" = ssq."questionId"
                LEFT JOIN "QuestionTranslation" qt_session
                    ON qt_session."questionId" = q."id"
                    AND qt_session."locale" = s."sessionLocale"
                LEFT JOIN "QuestionTranslation" qt_ru
                    ON qt_ru."questionId" = q."id"
                    AND qt_ru."locale" = 'ru'::"ContentLocale"
                LEFT JOIN "QuizSessionQuestionOption" ssqo
                    ON ssqo."sessionQuestionId" = ssq."id"
                LEFT JOIN "AnswerOption" ao
                    ON ao."id" = ssqo."optionId"
                LEFT JOIN "AnswerOptionTranslation" aot_session
                    ON aot_session."optionId" = ao."id"
                    AND aot_session."locale" = s."sessionLocale"
                LEFT JOIN "AnswerOptionTranslation" aot_ru
                    ON aot_ru."optionId" = ao."id"
                    AND aot_ru."locale" = 'ru'::"ContentLocale"
                WHERE
                    s."id" = $1
                    AND s."userId" = $2
                    AND s."status" = 'IN_PROGRESS'::"QuizSessionStatus"
                ORDER BY ssq."position" ASC, ssqo."displayOrder" ASC
            `,
            [sessionId, userId],
        );
    });

    if (result.rows.length === 0) {
        return null;
    }

    const firstRow = result.rows[0];
    const questions = new Map<string, SessionSnapshotPublicQuestion>();

    for (const row of result.rows) {
        if (
            !row.question_id ||
            !row.question_text ||
            !row.difficulty ||
            !row.option_id ||
            !row.option_text ||
            row.display_order === null
        ) {
            return null;
        }

        const existing = questions.get(row.question_id);

        if (existing) {
            existing.options.push({
                id: row.option_id,
                text: row.option_text,
                order: row.display_order,
            });
        } else {
            questions.set(row.question_id, {
                id: row.question_id,
                text: row.question_text,
                difficulty: row.difficulty,
                options: [
                    {
                        id: row.option_id,
                        text: row.option_text,
                        order: row.display_order,
                    },
                ],
            });
        }
    }

    if (questions.size !== firstRow.question_count) {
        return null;
    }

    return Array.from(questions.values());
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

        return createSnapshotWithPgClient(input);
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
        return loadSnapshotPublicQuestions(sessionId, userId);
    },

    // вопросы из snapshot для server-side scoring
    findSnapshotForScoring(sessionId: string, userId: string) {
        return loadSessionForSubmit(sessionId, userId).then((result) => {
            if (result.status !== 'ready') {
                return null;
            }

            return result.questions;
        });
    },

    // одна read-операция для submit: проверка сессии + snapshot для scoring
    findSessionForSubmit(sessionId: string, userId: string) {
        return loadSessionForSubmit(sessionId, userId);
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
        return completeQuizSessionWithPgClient(input);
    },
};
