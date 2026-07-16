/* жизненный цикл QuizSession (start → snapshot → quiz page → submit → review). */

import { randomUUID } from 'node:crypto';

import type { Client } from 'pg';

import type { Difficulty, QuestionType } from '@/types';
import type { Locale } from '@/shared/i18n';
import { prisma, withDatabaseRetry } from '@/lib/prisma';
import {
    isTransientDirectPgError,
    withDirectPgClient,
    withDirectPgWriteClient,
    withDirectPgWriteRetry,
    withPooledPgQuizStartClient,
} from '@/lib/db/direct-pg';
import { loadRandomSnapshotBundleWithPgClient } from '@/entities/question/question.repository';
import type { QuestionSnapshotBundleItem } from '@/entities/question/question.repository';
import { normalizeQuizImageUrl } from '@/shared/utils/normalize-quiz-image-url';

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
    displayImageUrl?: string | null;
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
    type?: QuestionType;
    imageUrl?: string | null;
    options: Array<{
        id: string;
        text: string;
        order: number;
    }>;
};

// вопрос из snapshot для server-side scoring (с isCorrect, без текста)
export type SessionSnapshotScoringQuestion = {
    id: string;
    difficulty: Difficulty;
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

// тип для результата создания snapshot сессии
type SessionSnapshotCreateResult = {
    id: string;
};

// тип для данных snapshot сессии
type QuizSessionSnapshotData = {
    version: 1;
    questions: Array<{
        id: string;
        text: string;
        difficulty: Difficulty;
        type?: QuestionType;
        imageUrl?: string | null;
        position: number;
        options: Array<{
            id: string;
            text: string;
            order: number;
            isCorrect: boolean;
        }>;
    }>;
};

// тип для входных данных для завершения сессии с ответом
type CompleteQuizAnswerInput = {
    questionId: string;
    selectedOptionId: string;
    isCorrect: boolean;
};

// тип для входных данных для завершения сессии с результатом
type CompleteQuizSessionWithResultInput = {
    sessionId: string;
    userId: string;
    score: number;
    totalQuestions: number;
    correctCount: number;
    answers: CompleteQuizAnswerInput[];
};

// тип для статуса завершения сессии с результатом
type CompleteQuizSessionWithResultStatus =
    | 'completed'
    | 'already_completed'
    | 'not_found';

export class QuizSessionStartError extends Error {
    readonly code: 'NOT_ENOUGH_QUESTIONS';

    constructor(code: 'NOT_ENOUGH_QUESTIONS') {
        super(code);
        this.code = code;
    }
}

// тип для входных данных для начала сессии с выбором вопросов
type StartQuizSessionWithPickInput = {
    userId: string;
    difficulty: Difficulty;
    questionCount: number;
    sessionLocale: Locale;
    locale: Locale;
    buildSnapshotQuestions: (
        picked: QuestionSnapshotBundleItem[],
    ) => SessionSnapshotQuestionInput[];
};

// тип для входных данных для создания сессии с json snapshot
type CreateQuizSessionWithJsonSnapshotInput =
    CreateQuizSessionWithSnapshotInput & {
        pickedQuestions: QuestionSnapshotBundleItem[];
    };

// тип для строки в public snapshot сессии
type SnapshotPublicRow = {
    session_id: string;
    question_count: number;
    question_id: string | null;
    question_text: string | null;
    display_image_url: string | null;
    difficulty: Difficulty | null;
    option_id: string | null;
    option_text: string | null;
    display_order: number | null;
};

// тип для строки в scoring snapshot сессии
type SnapshotScoringRow = {
    session_id: string;
    question_count: number;
    question_id: string | null;
    difficulty: Difficulty | null;
    option_id: string | null;
    is_correct: boolean | null;
};

// тип для строки в json snapshot сессии
type SessionSnapshotJsonRow = {
    session_id: string;
    question_count: number;
    snapshot_data: QuizSessionSnapshotData | string | null;
};

// тип для payload результатов обзора сессии
export type SessionReviewPayload = {
    sessionId: string;
    questionCount: number;
    questions: Array<{
        id: string;
        text: string;
        difficulty: Difficulty;
        type?: QuestionType;
        imageUrl?: string | null;
        position: number;
        options: Array<{
            id: string;
            text: string;
            order: number;
            isCorrect: boolean;
        }>;
    }>;
    answers: Array<{
        questionId: string;
        selectedOptionId: string;
        isCorrect: boolean;
    }>;
};

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
        row?.option_count === expectedOptionCount
    );
}

async function cleanupQuizSessionById(sessionId: string) {
    await withDirectPgWriteClient((client) =>
        client.query('DELETE FROM "QuizSession" WHERE "id" = $1', [sessionId]),
    ).catch(() => undefined);
}

async function loadQuizSessionSnapshotData(
    sessionId: string,
    userId: string,
): Promise<SessionSnapshotJsonRow | null> {
    const result = await withDirectPgClient((client) =>
        client.query<SessionSnapshotJsonRow>(
            `
                SELECT
                    "id" AS "session_id",
                    "questionCount" AS "question_count",
                    "snapshotData" AS "snapshot_data"
                FROM "QuizSession"
                WHERE
                    "id" = $1
                    AND "userId" = $2
                    AND "status" = 'IN_PROGRESS'::"QuizSessionStatus"
            `,
            [sessionId, userId],
        ),
    );

    return result.rows[0] ?? null;
}

async function isJsonSnapshotComplete(
    sessionId: string,
    userId: string,
    expectedQuestionCount: number,
) {
    const session = await loadQuizSessionSnapshotData(sessionId, userId);
    const snapshotData = parseSnapshotData(session?.snapshot_data ?? null);

    return snapshotData?.questions.length === expectedQuestionCount;
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

function buildSnapshotData(
    input: CreateQuizSessionWithSnapshotInput,
    pickedQuestions: QuestionSnapshotBundleItem[],
): QuizSessionSnapshotData {
    const pickedById = new Map(
        pickedQuestions.map((question) => [question.id, question]),
    );

    return {
        version: 1,
        questions: input.questions.map((question) => {
            const picked = pickedById.get(question.questionId);

            if (!picked) {
                throw new Error(
                    `Missing picked question ${question.questionId}`,
                );
            }

            const pickedOptions = new Map(
                picked.options.map((option) => [option.id, option]),
            );

            return {
                id: question.questionId,
                text: question.displayText,
                difficulty: picked.difficulty,
                type: picked.type,
                imageUrl: normalizeQuizImageUrl(question.displayImageUrl),
                position: question.position,
                options: question.options.map((option) => {
                    const pickedOption = pickedOptions.get(option.optionId);

                    if (!pickedOption) {
                        throw new Error(
                            `Missing picked option ${option.optionId}`,
                        );
                    }

                    return {
                        id: option.optionId,
                        text: option.displayText,
                        order: option.displayOrder,
                        isCorrect: pickedOption.isCorrect,
                    };
                }),
            };
        }),
    };
}

function parseSnapshotData(
    value: QuizSessionSnapshotData | string | null,
): QuizSessionSnapshotData | null {
    if (!value) {
        return null;
    }

    const data = typeof value === 'string' ? JSON.parse(value) : value;

    if (
        typeof data !== 'object' ||
        data === null ||
        data.version !== 1 ||
        !Array.isArray(data.questions)
    ) {
        return null;
    }

    return data as QuizSessionSnapshotData;
}

function mapSnapshotDataToPublicQuestions(
    snapshotData: QuizSessionSnapshotData,
    expectedQuestionCount: number,
): SessionSnapshotPublicQuestion[] | null {
    if (snapshotData.questions.length !== expectedQuestionCount) {
        return null;
    }

    return [...snapshotData.questions]
        .sort((left, right) => left.position - right.position)
        .map((question) => ({
            id: question.id,
            text: question.text,
            difficulty: question.difficulty,
            type: question.type,
            imageUrl: normalizeQuizImageUrl(question.imageUrl),
            options: [...question.options]
                .sort((left, right) => left.order - right.order)
                .map((option) => ({
                    id: option.id,
                    text: option.text,
                    order: option.order,
                })),
        }));
}

function mapSnapshotDataToScoringQuestions(
    snapshotData: QuizSessionSnapshotData,
    expectedQuestionCount: number,
): SessionSnapshotScoringQuestion[] | null {
    if (snapshotData.questions.length !== expectedQuestionCount) {
        return null;
    }

    return [...snapshotData.questions]
        .sort((left, right) => left.position - right.position)
        .map((question) => ({
            id: question.id,
            difficulty: question.difficulty,
            options: [...question.options]
                .sort((left, right) => left.order - right.order)
                .map((option) => ({
                    id: option.id,
                    isCorrect: option.isCorrect,
                })),
        }));
}

async function insertQuizSessionWithSnapshotData(
    client: Client,
    sessionId: string,
    input: CreateQuizSessionWithSnapshotInput,
    snapshotData: QuizSessionSnapshotData,
) {
    assertSnapshotDisplayTexts(input);

    await client.query(
        `
            INSERT INTO "QuizSession" (
                "id",
                "userId",
                "status",
                "difficulty",
                "questionCount",
                "sessionLocale",
                "snapshotData",
                "startedAt"
            )
            VALUES (
                $1,
                $2,
                $3::"QuizSessionStatus",
                $4::"Difficulty",
                $5,
                $6::"ContentLocale",
                $7::jsonb,
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
            JSON.stringify(snapshotData),
        ],
    );
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
        displayImageUrl: question.displayImageUrl ?? null,
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
                "displayText",
                "displayImageUrl"
            )
            VALUES ${buildValuesPlaceholder(sessionQuestionRows.length, 6)}
        `,
        sessionQuestionRows.flatMap((row) => [
            row.id,
            row.sessionId,
            row.questionId,
            row.position,
            row.displayText,
            row.displayImageUrl,
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

async function insertSnapshotOnClient(
    client: Client,
    sessionId: string,
    input: CreateQuizSessionWithSnapshotInput,
) {
    assertSnapshotDisplayTexts(input);
    await insertSnapshotRows(client, sessionId, input);
    return { id: sessionId };
}

async function createSnapshotWithPgClient(
    input: CreateQuizSessionWithSnapshotInput,
): Promise<SessionSnapshotCreateResult> {
    const expectedOptionCount = input.questions.reduce(
        (total, question) => total + question.options.length,
        0,
    );

    return withDirectPgWriteRetry(async (client) => {
        const sessionId = randomUUID();

        try {
            return await insertSnapshotOnClient(client, sessionId, input);
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
            throw error;
        }
    }, 2);
}

async function startQuizSessionWithPick(
    input: StartQuizSessionWithPickInput,
): Promise<SessionSnapshotCreateResult> {
    return withPooledPgQuizStartClient(async (client) => {
        const picked = await loadRandomSnapshotBundleWithPgClient(
            client,
            input.difficulty,
            input.questionCount,
            input.locale,
        );

        if (picked.length < input.questionCount) {
            throw new QuizSessionStartError('NOT_ENOUGH_QUESTIONS');
        }

        const questions = input.buildSnapshotQuestions(picked);
        const snapshotInput: CreateQuizSessionWithSnapshotInput = {
            userId: input.userId,
            difficulty: input.difficulty,
            questionCount: input.questionCount,
            sessionLocale: input.sessionLocale,
            questions,
        };

        const snapshotData = buildSnapshotData(snapshotInput, picked);

        const sessionId = randomUUID();

        try {
            await insertQuizSessionWithSnapshotData(
                client,
                sessionId,
                snapshotInput,
                snapshotData,
            );

            return { id: sessionId };
        } catch (error) {
            const recovered =
                isTransientDirectPgError(error) &&
                (await isJsonSnapshotComplete(
                    sessionId,
                    input.userId,
                    input.questionCount,
                ).catch(() => false));

            if (recovered) {
                return { id: sessionId };
            }

            await cleanupQuizSessionById(sessionId);
            throw error;
        }
    }, 2);
}

async function createJsonSnapshotSession(
    input: CreateQuizSessionWithJsonSnapshotInput,
): Promise<SessionSnapshotCreateResult> {
    return withPooledPgQuizStartClient(async (client) => {
        const sessionId = randomUUID();
        const snapshotData = buildSnapshotData(input, input.pickedQuestions);

        try {
            await insertQuizSessionWithSnapshotData(
                client,
                sessionId,
                input,
                snapshotData,
            );

            return { id: sessionId };
        } catch (error) {
            const recovered =
                isTransientDirectPgError(error) &&
                (await isJsonSnapshotComplete(
                    sessionId,
                    input.userId,
                    input.questionCount,
                ).catch(() => false));

            if (recovered) {
                return { id: sessionId };
            }

            await cleanupQuizSessionById(sessionId);
            throw error;
        }
    }, 2);
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
    const jsonSnapshot = await loadQuizSessionSnapshotData(sessionId, userId);

    if (jsonSnapshot) {
        const snapshotData = parseSnapshotData(jsonSnapshot.snapshot_data);

        if (snapshotData) {
            const questions = mapSnapshotDataToScoringQuestions(
                snapshotData,
                jsonSnapshot.question_count,
            );

            return questions
                ? {
                      status: 'ready',
                      sessionId: jsonSnapshot.session_id,
                      questions,
                  }
                : { status: 'invalid_snapshot' };
        }
    }

    const result = await withDirectPgClient((client) => {
        return client.query<SnapshotScoringRow>(
            `
                SELECT
                    s."id" AS "session_id",
                    s."questionCount" AS "question_count",
                    q."id" AS "question_id",
                    q."difficulty"::text AS "difficulty",
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
        if (
            !row.question_id ||
            !row.difficulty ||
            !row.option_id ||
            row.is_correct === null
        ) {
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
                difficulty: row.difficulty,
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

// тип для строки в результатах обзора сессии
type ReviewAnswerRow = {
    question_id: string;
    selected_option_id: string;
    is_correct: boolean;
};

// функция для загрузки результатов обзора сессии
async function loadCompletedSessionReview(
    sessionId: string,
    userId: string,
): Promise<SessionReviewPayload | null> {
    return withDirectPgClient(async (client) => {
        const sessionResult = await client.query<SessionSnapshotJsonRow>(
            `
                SELECT
                    "id" AS "session_id",
                    "questionCount" AS "question_count",
                    "snapshotData" AS "snapshot_data"
                FROM "QuizSession"
                WHERE
                    "id" = $1
                    AND "userId" = $2
                    AND "status" = 'COMPLETED'::"QuizSessionStatus"
                LIMIT 1
            `,
            [sessionId, userId],
        );

        const session = sessionResult.rows[0];

        if (!session) {
            return null;
        }

        const snapshotData = parseSnapshotData(session.snapshot_data);

        if (
            !snapshotData ||
            snapshotData.questions.length !== session.question_count
        ) {
            return null;
        }

        const answersResult = await client.query<ReviewAnswerRow>(
            `
                SELECT
                    "questionId" AS "question_id",
                    "selectedOptionId" AS "selected_option_id",
                    "isCorrect" AS "is_correct"
                FROM "QuizAnswer"
                WHERE "sessionId" = $1
            `,
            [sessionId],
        );

        return {
            sessionId: session.session_id,
            questionCount: session.question_count,
            questions: [...snapshotData.questions]
                .sort((left, right) => left.position - right.position)
                .map((question) => ({
                    id: question.id,
                    text: question.text,
                    difficulty: question.difficulty,
                    type: question.type,
                    imageUrl: normalizeQuizImageUrl(question.imageUrl),
                    position: question.position,
                    options: [...question.options].sort(
                        (left, right) => left.order - right.order,
                    ),
                })),
            answers: answersResult.rows.map((row) => ({
                questionId: row.question_id,
                selectedOptionId: row.selected_option_id,
                isCorrect: row.is_correct,
            })),
        };
    });
}

async function loadSnapshotPublicQuestions(
    sessionId: string,
    userId: string,
): Promise<SessionSnapshotPublicQuestion[] | null> {
    const jsonSnapshot = await loadQuizSessionSnapshotData(sessionId, userId);

    if (jsonSnapshot) {
        const snapshotData = parseSnapshotData(jsonSnapshot.snapshot_data);

        if (snapshotData) {
            return mapSnapshotDataToPublicQuestions(
                snapshotData,
                jsonSnapshot.question_count,
            );
        }
    }

    const result = await withDirectPgClient((client) => {
        return client.query<SnapshotPublicRow>(
            `
                SELECT
                    s."id" AS "session_id",
                    s."questionCount" AS "question_count",
                    ssq."questionId" AS "question_id",
                    ssq."displayText" AS "question_text",
                    ssq."displayImageUrl" AS "display_image_url",
                    q."difficulty"::text AS "difficulty",
                    ssqo."optionId" AS "option_id",
                    ssqo."displayText" AS "option_text",
                    ssqo."displayOrder" AS "display_order"
                FROM "QuizSession" s
                INNER JOIN "QuizSessionQuestion" ssq
                    ON ssq."sessionId" = s."id"
                INNER JOIN "Question" q
                    ON q."id" = ssq."questionId"
                INNER JOIN "QuizSessionQuestionOption" ssqo
                    ON ssqo."sessionQuestionId" = ssq."id"
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
                imageUrl: normalizeQuizImageUrl(row.display_image_url),
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
    // pick + snapshot write на одном direct pg соединении (quiz start hot path)
    startWithRandomQuestions(input: StartQuizSessionWithPickInput) {
        return startQuizSessionWithPick(input);
    },

    // создание только QuizSession + JSON snapshot (fast start path)
    createWithJsonSnapshot(input: CreateQuizSessionWithJsonSnapshotInput) {
        if (input.questions.length !== input.questionCount) {
            throw new Error(
                `Snapshot question count mismatch: expected ${input.questionCount}, got ${input.questions.length}`,
            );
        }

        return createJsonSnapshotSession(input);
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

    // результаты обзора сессии
    findReviewForUser(sessionId: string, userId: string) {
        return loadCompletedSessionReview(sessionId, userId);
    },
};
