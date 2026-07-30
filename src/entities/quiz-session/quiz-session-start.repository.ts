/**
 * QuizSession start: pick + JSON snapshot write (+ legacy relational create).
 *
 * Зачем отдельный модуль (§11.7): hot path создания сессии не должен жить
 * в одном файле с submit/reads. SQL перенесён as-is — без rewrite.
 * Neon: pooled quiz-start client для JSON insert; recovery после transient
 * ошибки; не await client.end() на response path (см. DECISIONS → Neon Write Path).
 * Публичный фасад: quiz-session.repository.ts.
 * См. docs/DECISIONS.md → Repository File Split.
 */

import { randomUUID } from 'node:crypto';

import type { Client } from 'pg';

import type { Difficulty } from '@/types';
import type { Locale } from '@/shared/i18n';
import {
    isTransientDirectPgError,
    withDirectPgClient,
    withDirectPgWriteClient,
    withDirectPgWriteRetry,
    withPooledPgQuizStartClient,
} from '@/lib/db/direct-pg';
import { loadRandomSnapshotBundleWithPgClient } from '@/entities/question/question.repository';
import type { QuestionSnapshotBundleItem } from '@/entities/question/question.repository';
import type {
    CreateQuizSessionWithSnapshotInput,
    SessionSnapshotQuestionInput,
} from '@/entities/quiz-session/quiz-session.types';
import { QuizSessionStartError } from '@/entities/quiz-session/quiz-session.types';
import type { QuizSessionSnapshotData } from '@/entities/quiz-session/quiz-session-snapshot';
import {
    assertSnapshotDisplayTexts,
    buildSnapshotData,
    parseSnapshotData,
} from '@/entities/quiz-session/quiz-session-snapshot';

type SessionSnapshotCreateResult = {
    id: string;
};

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

type CreateQuizSessionWithJsonSnapshotInput =
    CreateQuizSessionWithSnapshotInput & {
        pickedQuestions: QuestionSnapshotBundleItem[];
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

/** Recovery-check после transient write: JSON snapshot уже на месте? */
async function isJsonSnapshotComplete(
    sessionId: string,
    userId: string,
    expectedQuestionCount: number,
) {
    const result = await withDirectPgClient((client) =>
        client.query<{
            question_count: number;
            snapshot_data: QuizSessionSnapshotData | string | null;
        }>(
            `
                SELECT
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

    const session = result.rows[0];
    const snapshotData = parseSnapshotData(session?.snapshot_data ?? null);

    return snapshotData?.questions.length === expectedQuestionCount;
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
                "dailyChallengeId",
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
                $8,
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
            input.dailyChallengeId ?? null,
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

/** Методы start для thin facade quizSessionRepository. */
export const quizSessionStartMethods = {
    startWithRandomQuestions(input: StartQuizSessionWithPickInput) {
        return startQuizSessionWithPick(input);
    },

    createWithJsonSnapshot(input: CreateQuizSessionWithJsonSnapshotInput) {
        if (input.questions.length !== input.questionCount) {
            throw new Error(
                `Snapshot question count mismatch: expected ${input.questionCount}, got ${input.questions.length}`,
            );
        }

        return createJsonSnapshotSession(input);
    },

    createWithSnapshot(input: CreateQuizSessionWithSnapshotInput) {
        if (input.questions.length !== input.questionCount) {
            throw new Error(
                `Snapshot question count mismatch: expected ${input.questionCount}, got ${input.questions.length}`,
            );
        }

        return createSnapshotWithPgClient(input);
    },
};
