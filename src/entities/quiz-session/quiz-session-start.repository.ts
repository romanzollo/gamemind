/**
 * QuizSession start: pick + JSON snapshot write (+ legacy relational create).
 *
 * Зачем отдельный модуль (§11.7): hot path создания сессии не должен жить
 * в одном файле с submit/reads. SQL перенесён as-is — без rewrite.
 * Neon: Direct (unpooled). Hot path Classic/Timed/Daily: pick (отдельный
 * budget) → createWithJsonSnapshot (свой budget). Не склеивать тяжёлый
 * RANDOM pick + INSERT в один 12s client — ложный DB_TIMEOUT на Windows.
 * `startWithRandomQuestions` оставлен legacy; actions его не зовут.
 * Recovery после transient — вне queue (nested withDirectPgQueue = deadlock).
 * Не await client.end() на response path (см. DECISIONS → Neon Write Path).
 * Timed abandon-on-new-start: на том же client, что INSERT (см. Timed Mode).
 * Публичный фасад: quiz-session.repository.ts.
 * См. docs/DECISIONS.md → Quiz Start / Session Load Playbook.
 */

import { randomUUID } from 'node:crypto';

import type { Client } from 'pg';

import type { Difficulty } from '@/types';
import type { Locale } from '@/shared/i18n';
import {
    isTransientDirectPgError,
    withDirectPgClient,
    withDirectPgQuizStartClient,
    withDirectPgWriteClient,
    withDirectPgWriteRetry,
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
    timedEndsAt?: Date | null;
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

    if (input.dailyChallengeId && input.timedEndsAt) {
        throw new Error(
            'QuizSession cannot be both Daily and Timed (dailyChallengeId + timedEndsAt)',
        );
    }

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
                "timedEndsAt",
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
                $9,
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
            input.timedEndsAt ?? null,
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

async function recoverJsonSnapshotAfterWriteError(
    sessionId: string,
    userId: string,
    expectedQuestionCount: number,
    error: unknown,
): Promise<SessionSnapshotCreateResult | null> {
    if (!isTransientDirectPgError(error)) {
        return null;
    }

    const recovered = await isJsonSnapshotComplete(
        sessionId,
        userId,
        expectedQuestionCount,
    ).catch(() => false);

    return recovered ? { id: sessionId } : null;
}

async function startQuizSessionWithPick(
    input: StartQuizSessionWithPickInput,
): Promise<SessionSnapshotCreateResult> {
    const sessionId = randomUUID();
    const timedEndsAt = input.timedEndsAt ?? null;

    try {
        // Без retry внутри write-operation: late commit + повторный INSERT с тем же id
        // превращается в duplicate key и может снести уже созданную сессию cleanup-ом.
        return await withDirectPgQuizStartClient(async (client) => {
            // Timed: orphan IN_PROGRESS → ABANDONED на том же TLS, что pick+INSERT.
            if (timedEndsAt != null) {
                await abandonInProgressTimedOnClient(client, input.userId);
            }

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
                timedEndsAt,
                questions,
            };

            const snapshotData = buildSnapshotData(snapshotInput, picked);

            await insertQuizSessionWithSnapshotData(
                client,
                sessionId,
                snapshotInput,
                snapshotData,
            );

            return { id: sessionId };
        }, 1);
    } catch (error) {
        if (error instanceof QuizSessionStartError) {
            throw error;
        }

        // Recovery вне queue — иначе nested withDirectPgQueue deadlock.
        const recovered = await recoverJsonSnapshotAfterWriteError(
            sessionId,
            input.userId,
            input.questionCount,
            error,
        );

        if (recovered) {
            return recovered;
        }

        await cleanupQuizSessionById(sessionId);
        throw error;
    }
}

/**
 * UPDATE на уже открытом клиенте — без нового TLS к Neon.
 * Canon: stuckSessionPolicy = abandon_on_new_start (только timed).
 */
async function abandonInProgressTimedOnClient(
    client: Client,
    userId: string,
): Promise<number> {
    const result = await client.query(
        `
            UPDATE "QuizSession"
            SET "status" = 'ABANDONED'::"QuizSessionStatus"
            WHERE
                "userId" = $1
                AND "status" = 'IN_PROGRESS'::"QuizSessionStatus"
                AND "timedEndsAt" IS NOT NULL
        `,
        [userId],
    );

    return result.rowCount ?? 0;
}

/**
 * Помечает застрявшие timed-сессии пользователя как ABANDONED.
 *
 * Контракт: TIMED_MODE_MVP_RULES.stuckSessionPolicy = abandon_on_new_start.
 * Фильтр `timedEndsAt IS NOT NULL` — только Timed; classic/daily не трогаем.
 * Без QuizResult: это не завершение, а «бросил и начал заново».
 *
 * Neon: `withDirectPgQuizStartClient` (Direct + queue + timeout), не отдельный
 * write-client. Основной путь: abandon внутри start/create на том же client.
 */
async function abandonInProgressTimedByUserId(
    userId: string,
): Promise<{ abandonedCount: number }> {
    return withDirectPgQuizStartClient(async (client) => {
        const abandonedCount = await abandonInProgressTimedOnClient(
            client,
            userId,
        );
        return { abandonedCount };
    });
}

async function createJsonSnapshotSession(
    input: CreateQuizSessionWithJsonSnapshotInput,
): Promise<SessionSnapshotCreateResult> {
    const sessionId = randomUUID();
    const snapshotData = buildSnapshotData(input, input.pickedQuestions);

    try {
        // См. startWithRandomQuestions: recovery должен идти после одного attempt.
        return await withDirectPgQuizStartClient(async (client) => {
            // Timed: закрыть orphan IN_PROGRESS на том же соединении, что INSERT.
            // Classic/daily (timedEndsAt null) — no-op. См. DECISIONS → Timed Mode.
            if (input.timedEndsAt != null) {
                await abandonInProgressTimedOnClient(client, input.userId);
            }

            await insertQuizSessionWithSnapshotData(
                client,
                sessionId,
                input,
                snapshotData,
            );

            return { id: sessionId };
        }, 1);
    } catch (error) {
        const recovered = await recoverJsonSnapshotAfterWriteError(
            sessionId,
            input.userId,
            input.questionCount,
            error,
        );

        if (recovered) {
            return recovered;
        }

        await cleanupQuizSessionById(sessionId);
        throw error;
    }
}

/** Методы start для thin facade quizSessionRepository. */
export const quizSessionStartMethods = {
    /**
     * Legacy merged pick+INSERT (один Direct budget).
     * Classic/Timed hot path: split pick → createWithJsonSnapshot (не звать отсюда).
     * attempts=1: не retry INSERT с тем же sessionId (late-commit risk).
     */
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

    abandonInProgressTimedByUserId,
};
