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
 * Timed abandon-on-new-start: pooled scalar до pick, не на Direct create
 * вместе с JSONB INSERT (см. Timed Mode + Windows+Neon TOAST).
 * Survival: abandon + INSERT SurvivalRun (pooled) до pick;
 * create волны 1 = split pooled: scalar INSERT → JSONB UPDATE → startedAt.
 * Classic/Timed/Daily create — Direct. Dev-лог snapshotBytes/writePath.
 * Публичный фасад: quiz-session.repository.ts.
 * См. docs/DECISIONS.md → Quiz Start / Session Load Playbook.
 */

import { randomUUID } from 'node:crypto';

import type { Client } from 'pg';

import type { Difficulty, QuizSessionPoolKind } from '@/types';
import type { Locale } from '@/shared/i18n';
import {
    isTransientDirectPgError,
    withDirectPgClient,
    withDirectPgQuizStartClient,
    withDirectPgWriteClient,
    withDirectPgWriteRetry,
    withPooledPgClient,
} from '@/lib/db/direct-pg';
import { loadRandomSnapshotBundleWithPgClient } from '@/entities/question/question.repository';
import type { QuestionSnapshotBundleItem } from '@/entities/question/question.repository';
import type {
    CreateQuizSessionWithSnapshotInput,
    QuizSessionSurvivalPlayView,
    SessionSnapshotQuestionInput,
} from '@/entities/quiz-session/quiz-session.types';
import { QuizSessionStartError } from '@/entities/quiz-session/quiz-session.types';
import { rememberQuizPlayLoad } from '@/entities/quiz-session/play-load-handoff';
import type { QuizSessionSnapshotData } from '@/entities/quiz-session/quiz-session-snapshot';
import {
    assertSnapshotDisplayTexts,
    buildSnapshotData,
    mapSnapshotDataToPublicQuestions,
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

/**
 * Тот же budget, что Direct read — не повышение глобального timeout.
 * Write create без лимита клинил Blitz: hop не логировался, спиннер вечный.
 */
const QUIZ_START_WRITE_ATTEMPT_MS = 18_000;

/**
 * Survival hop2 (JSONB UPDATE) — только pooled, только survivalRunId != null.
 * Короче 18s abort → late-commit + startedAt до hang; без лимита → вечный POST
 * на Windows next dev. 45s даёт TOAST-классу завершиться; hop3 startedAt после ok.
 */
const SURVIVAL_JSONB_UPDATE_TIMEOUT_MS = 45_000;

type QuizStartJsonWritePath = 'direct' | 'pooled' | 'split';

/**
 * Dev-only: размер JSONB и write-path. Survival 12Q vs Blitz 10 —
 * не путать create timeout с play-load TOAST SELECT.
 */
function logJsonSnapshotCreateDiagnostics(
    input: CreateQuizSessionWithSnapshotInput,
    snapshotData: QuizSessionSnapshotData,
    writePath: QuizStartJsonWritePath,
) {
    if (process.env.NODE_ENV !== 'development') {
        return;
    }

    const isSurvival = input.survivalRunId != null;
    const isTimed = input.timedEndsAt != null;

    if (!isSurvival && !isTimed) {
        return;
    }

    console.info(
        `quiz.start.create snapshotBytes=${Buffer.byteLength(
            JSON.stringify(snapshotData),
            'utf8',
        )} writePath=${writePath} questionCount=${input.questionCount} mode=${isSurvival ? 'survival' : 'timed'}`,
    );
}

function toIsoTimestamp(value: Date | null | undefined): string | null {
    if (value == null) {
        return null;
    }

    if (Number.isNaN(value.getTime())) {
        return null;
    }

    return value.toISOString();
}

function buildSurvivalPlayView(
    input: CreateQuizSessionWithSnapshotInput,
    startedAt: Date | null,
): QuizSessionSurvivalPlayView | null {
    const runId = input.survivalRunId ?? null;
    const waveIndex = input.survivalWaveIndex ?? null;
    const startedAtIso = toIsoTimestamp(startedAt);

    if (runId == null || waveIndex == null || waveIndex < 1 || !startedAtIso) {
        return null;
    }

    return {
        runId,
        waveIndex,
        startedAt: startedAtIso,
    };
}

function stashPlayLoadHandoff(
    sessionId: string,
    input: CreateQuizSessionWithSnapshotInput,
    snapshotData: QuizSessionSnapshotData,
    timedEndsAt: Date | null,
    startedAt: Date | null,
) {
    const isSurvival = input.survivalRunId != null;
    const survival = isSurvival
        ? buildSurvivalPlayView(input, startedAt)
        : null;

    // Survival без startedAt не stash'им: клиентский банк тогда врёт.
    // Page возьмёт pooled SELECT скаляров (не TOAST на Direct).
    if (isSurvival && !survival) {
        return;
    }

    const mapped = mapSnapshotDataToPublicQuestions(
        snapshotData,
        input.questionCount,
        input.sessionLocale,
        { includeCorrectness: isSurvival },
    );

    if (!mapped) {
        return;
    }

    rememberQuizPlayLoad(sessionId, input.userId, {
        questions: mapped,
        timedEndsAt: timedEndsAt?.toISOString() ?? null,
        difficulty: resolveSessionPoolInsert(input).difficulty,
        survival,
    });
}

function resolveSessionPoolInsert(input: CreateQuizSessionWithSnapshotInput): {
    difficulty: Difficulty | null;
    poolKind: QuizSessionPoolKind;
} {
    const poolKind = input.poolKind ?? 'SINGLE';

    return {
        poolKind,
        difficulty: poolKind === 'MIXED' ? null : input.difficulty,
    };
}

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
    // Pooled scalar DELETE: после timeout create Direct-очередь уже горячая;
    // ещё один unpooled hop клинит home (~70s). Late-commit orphan снимет
    // Survival abandon на следующем старте.
    await withPooledPgClient(
        (client) =>
            client.query('DELETE FROM "QuizSession" WHERE "id" = $1', [
                sessionId,
            ]),
        {
            debugLabel: 'quiz.start.cleanup',
            attemptTimeoutMs: 5_000,
        },
    ).catch(() => undefined);
}

/**
 * Recovery после timeout create: только скаляры на pooled.
 * SELECT snapshotData на Direct сразу после INSERT — Aug 14 hang
 * (18s create + 18s TOAST read → POST ~46s, home клинит).
 * Snapshot уже в памяти caller — для handoff JSONB из БД не нужен.
 */
const CREATE_RECOVERY_SETTLE_MS = 400;

function waitMs(milliseconds: number) {
    return new Promise<void>((resolve) => {
        setTimeout(resolve, milliseconds);
    });
}

function toStartedAtDate(
    value: Date | string | null | undefined,
): Date | null {
    if (value == null) {
        return null;
    }

    const date = value instanceof Date ? value : new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
}

async function findCommittedJsonSnapshotScalars(
    sessionId: string,
    userId: string,
    expectedQuestionCount: number,
): Promise<{ complete: boolean; startedAt: Date | null }> {
    try {
        const result = await withPooledPgClient(
            (client) =>
                client.query<{
                    question_count: number;
                    started_at: Date | string | null;
                }>(
                    `
                        SELECT
                            "questionCount" AS "question_count",
                            "startedAt" AS "started_at"
                        FROM "QuizSession"
                        WHERE
                            "id" = $1
                            AND "userId" = $2
                            AND "status" = 'IN_PROGRESS'::"QuizSessionStatus"
                            AND "snapshotData" IS NOT NULL
                    `,
                    [sessionId, userId],
                ),
            {
                debugLabel: 'quiz.start.create-recover',
                attemptTimeoutMs: 5_000,
            },
        );

        const session = result.rows[0];

        return {
            complete: session?.question_count === expectedQuestionCount,
            startedAt: toStartedAtDate(session?.started_at),
        };
    } catch {
        return { complete: false, startedAt: null };
    }
}

function assertSurvivalSessionCreateInput(
    input: CreateQuizSessionWithSnapshotInput,
    pool: { difficulty: Difficulty | null; poolKind: QuizSessionPoolKind },
) {
    if (input.timedEndsAt != null || input.dailyChallengeId) {
        throw new Error(
            'QuizSession Survival cannot set timedEndsAt or dailyChallengeId',
        );
    }

    if (pool.poolKind !== 'SINGLE' || pool.difficulty == null) {
        throw new Error('Survival session must be poolKind SINGLE');
    }

    const survivalWaveIndex = input.survivalWaveIndex ?? null;
    const survivalRunId = input.survivalRunId ?? null;

    if (
        survivalRunId == null ||
        survivalWaveIndex == null ||
        survivalWaveIndex < 1
    ) {
        throw new Error('Survival session requires survivalRunId and waveIndex >= 1');
    }
}

/** Hop 1: скаляры без JSONB — быстрый pooled INSERT. startedAt пока DEFAULT. */
async function insertSurvivalSessionScalarOnClient(
    client: Client,
    sessionId: string,
    input: CreateQuizSessionWithSnapshotInput,
) {
    const pool = resolveSessionPoolInsert(input);
    assertSurvivalSessionCreateInput(input, pool);

    await client.query(
        `
            INSERT INTO "QuizSession" (
                "id",
                "userId",
                "status",
                "difficulty",
                "poolKind",
                "questionCount",
                "sessionLocale",
                "survivalRunId",
                "survivalWaveIndex"
            )
            VALUES (
                $1,
                $2,
                $3::"QuizSessionStatus",
                $4::"Difficulty",
                $5::"QuizSessionPoolKind",
                $6,
                $7::"ContentLocale",
                $8,
                $9
            )
        `,
        [
            sessionId,
            input.userId,
            'IN_PROGRESS',
            pool.difficulty,
            pool.poolKind,
            input.questionCount,
            input.sessionLocale,
            input.survivalRunId,
            input.survivalWaveIndex,
        ],
    );
}

/** Hop 2: JSONB отдельно от scalar INSERT (урок Blitz: тяжёлый write не на одном budget с clock). */
async function updateSurvivalSessionSnapshotOnClient(
    client: Client,
    sessionId: string,
    userId: string,
    snapshotData: QuizSessionSnapshotData,
) {
    const snapshotJson = JSON.stringify(snapshotData);
    const result = await client.query(
        `
            UPDATE "QuizSession"
            SET "snapshotData" = $1::jsonb
            WHERE
                "id" = $2
                AND "userId" = $3
                AND "survivalRunId" IS NOT NULL
        `,
        [snapshotJson, sessionId, userId],
    );

    if ((result.rowCount ?? 0) !== 1) {
        throw new Error('Survival snapshot UPDATE missed row');
    }
}

/**
 * Hop 3: startedAt ПОСЛЕ JSONB — банк T0=20 не съедается пока UPDATE висит.
 * JS Date, не SQL NOW() в naive TIMESTAMP (урок Timed timedEndsAt).
 */
async function armSurvivalSessionStartedAtOnClient(
    client: Client,
    sessionId: string,
    userId: string,
): Promise<Date> {
    const startedAt = new Date();
    const result = await client.query(
        `
            UPDATE "QuizSession"
            SET "startedAt" = $1
            WHERE
                "id" = $2
                AND "userId" = $3
                AND "survivalRunId" IS NOT NULL
        `,
        [startedAt, sessionId, userId],
    );

    if ((result.rowCount ?? 0) !== 1) {
        throw new Error('Survival startedAt UPDATE missed row');
    }

    return startedAt;
}

async function recoverSurvivalJsonSnapshotAfterWriteError(
    sessionId: string,
    userId: string,
    expectedQuestionCount: number,
    error: unknown,
): Promise<(SessionSnapshotCreateResult & { startedAt: Date }) | null> {
    if (!isTransientDirectPgError(error)) {
        return null;
    }

    await waitMs(CREATE_RECOVERY_SETTLE_MS);

    const check = await findCommittedJsonSnapshotScalars(
        sessionId,
        userId,
        expectedQuestionCount,
    );

    if (!check.complete) {
        return null;
    }

    // Late-commit hop2: JSONB есть, startedAt мог быть до hang — перезаписать.
    try {
        const startedAt = await withPooledPgClient(
            (client) =>
                armSurvivalSessionStartedAtOnClient(
                    client,
                    sessionId,
                    userId,
                ),
            {
                debugLabel: 'quiz.start.survival-started-at-recover',
                attemptTimeoutMs: 5_000,
            },
        );

        return { id: sessionId, startedAt };
    } catch {
        return check.startedAt
            ? { id: sessionId, startedAt: check.startedAt }
            : null;
    }
}

/**
 * Survival wave 1: scalar INSERT → JSONB UPDATE (survival-only 45s) → startedAt UPDATE.
 * Тот же класс разделения, что Timed abandon до pick и Blitz clock после connect.
 */
async function createSurvivalJsonSnapshotSession(
    sessionId: string,
    input: CreateQuizSessionWithJsonSnapshotInput,
    snapshotData: QuizSessionSnapshotData,
): Promise<{ id: string; timedEndsAt: null; startedAt: Date }> {
    assertSnapshotDisplayTexts(input);

    logJsonSnapshotCreateDiagnostics(input, snapshotData, 'split');

    try {
        await withPooledPgClient(
            (client) =>
                insertSurvivalSessionScalarOnClient(client, sessionId, input),
            {
                debugLabel: 'quiz.start.create-scalar',
                attemptTimeoutMs: 10_000,
            },
        );

        await withPooledPgClient(
            (client) =>
                updateSurvivalSessionSnapshotOnClient(
                    client,
                    sessionId,
                    input.userId,
                    snapshotData,
                ),
            {
                debugLabel: 'quiz.start.create-snapshot',
                attemptTimeoutMs: SURVIVAL_JSONB_UPDATE_TIMEOUT_MS,
            },
        );

        const startedAt = await withPooledPgClient(
            (client) =>
                armSurvivalSessionStartedAtOnClient(
                    client,
                    sessionId,
                    input.userId,
                ),
            {
                debugLabel: 'quiz.start.survival-started-at',
                attemptTimeoutMs: 5_000,
            },
        );

        return { id: sessionId, timedEndsAt: null, startedAt };
    } catch (error) {
        const recovered = await recoverSurvivalJsonSnapshotAfterWriteError(
            sessionId,
            input.userId,
            input.questionCount,
            error,
        );

        if (recovered) {
            return {
                id: recovered.id,
                timedEndsAt: null,
                startedAt: recovered.startedAt,
            };
        }

        if (!isTransientDirectPgError(error)) {
            await cleanupQuizSessionById(sessionId);
        }

        throw error;
    }
}

async function insertQuizSessionWithSnapshotData(
    client: Client,
    sessionId: string,
    input: CreateQuizSessionWithSnapshotInput,
    snapshotData: QuizSessionSnapshotData,
): Promise<{ timedEndsAt: Date | null; startedAt: Date | null }> {
    assertSnapshotDisplayTexts(input);

    if (input.dailyChallengeId && input.timedEndsAt) {
        throw new Error(
            'QuizSession cannot be both Daily and Timed (dailyChallengeId + timedEndsAt)',
        );
    }

    const pool = resolveSessionPoolInsert(input);
    // TIMESTAMP(3) without TZ: SQL NOW() пишет UTC-стену, node-pg читает как local
    // (UTC+2 → дедлайн в прошлом → сразу «время вышло»). Date после connect
    // совпадает с сериализацией node-pg. Не считать now+60 до create hop.
    const timedEndsAtValue =
        input.timedEndsAt != null
            ? new Date(
                  Date.now() +
                      (input.timedDurationSeconds ?? 60) * 1000,
              )
            : null;

    const survivalRunId = input.survivalRunId ?? null;
    const survivalWaveIndex = input.survivalWaveIndex ?? null;
    const isSurvival = survivalRunId != null;

    if (isSurvival) {
        throw new Error(
            'Survival JSONB create must use createSurvivalJsonSnapshotSession split path',
        );
    }

    if (survivalWaveIndex != null) {
        throw new Error('survivalWaveIndex requires survivalRunId');
    }

    const snapshotJson = JSON.stringify(snapshotData);
    const baseValues = [
        sessionId,
        input.userId,
        'IN_PROGRESS',
        pool.difficulty,
        pool.poolKind,
        input.questionCount,
        input.sessionLocale,
        snapshotJson,
        input.dailyChallengeId ?? null,
        timedEndsAtValue,
    ] as const;

    // Classic / Timed / Daily: survival-колонки не перечисляем → NULL
    // (CHECK: waveIndex/clockOk тоже NULL). startedAt = SQL NOW() as-is.
    await client.query(
        `
            INSERT INTO "QuizSession" (
                "id",
                "userId",
                "status",
                "difficulty",
                "poolKind",
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
                $5::"QuizSessionPoolKind",
                $6,
                $7::"ContentLocale",
                $8::jsonb,
                $9,
                $10,
                NOW()
            )
        `,
        [...baseValues],
    );

    return { timedEndsAt: timedEndsAtValue, startedAt: null };
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

    const pool = resolveSessionPoolInsert(input);

    await client.query(
        `
            INSERT INTO "QuizSession" (
                "id",
                "userId",
                "status",
                "difficulty",
                "poolKind",
                "questionCount",
                "sessionLocale",
                "startedAt"
            )
            VALUES (
                $1,
                $2,
                $3::"QuizSessionStatus",
                $4::"Difficulty",
                $5::"QuizSessionPoolKind",
                $6,
                $7::"ContentLocale",
                NOW()
            )
        `,
        [
            sessionId,
            input.userId,
            'IN_PROGRESS',
            pool.difficulty,
            pool.poolKind,
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
): Promise<(SessionSnapshotCreateResult & { startedAt: Date | null }) | null> {
    if (!isTransientDirectPgError(error)) {
        return null;
    }

    await waitMs(CREATE_RECOVERY_SETTLE_MS);

    const check = await findCommittedJsonSnapshotScalars(
        sessionId,
        userId,
        expectedQuestionCount,
    );

    if (!check.complete) {
        return null;
    }

    return { id: sessionId, startedAt: check.startedAt };
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
 * Neon: `withPooledPgClient` вне Direct-очереди, до pick — не extra unpooled
 * TLS и не UPDATE на том же клиенте, что JSONB INSERT (TOAST hang class).
 * Звать из runTimedQuizStart до cycle/resolve.
 */
async function abandonInProgressTimedByUserId(
    userId: string,
): Promise<{ abandonedCount: number }> {
    return withPooledPgClient(
        async (client) => {
            const abandonedCount = await abandonInProgressTimedOnClient(
                client,
                userId,
            );
            return { abandonedCount };
        },
        {
            debugLabel: 'quiz.start.abandon',
            attemptTimeoutMs: QUIZ_START_WRITE_ATTEMPT_MS,
        },
    );
}

async function createJsonSnapshotSession(
    input: CreateQuizSessionWithJsonSnapshotInput,
): Promise<SessionSnapshotCreateResult> {
    const sessionId = randomUUID();
    const snapshotData = buildSnapshotData(input, input.pickedQuestions);

    try {
        if (input.survivalRunId != null) {
            const created = await createSurvivalJsonSnapshotSession(
                sessionId,
                input,
                snapshotData,
            );

            stashPlayLoadHandoff(
                created.id,
                input,
                snapshotData,
                created.timedEndsAt,
                created.startedAt,
            );

            return { id: created.id };
        }

        logJsonSnapshotCreateDiagnostics(input, snapshotData, 'direct');

        const writeSnapshot = async (client: Client) => {
            const inserted = await insertQuizSessionWithSnapshotData(
                client,
                sessionId,
                input,
                snapshotData,
            );

            return {
                id: sessionId,
                timedEndsAt: inserted.timedEndsAt,
                startedAt: inserted.startedAt,
            };
        };

        const created = await withDirectPgWriteClient(writeSnapshot, {
            debugLabel: 'quiz.start.create',
            attemptTimeoutMs: QUIZ_START_WRITE_ATTEMPT_MS,
        });

        stashPlayLoadHandoff(
            created.id,
            input,
            snapshotData,
            created.timedEndsAt,
            created.startedAt,
        );

        return { id: created.id };
    } catch (error) {
        const recovered = await recoverJsonSnapshotAfterWriteError(
            sessionId,
            input.userId,
            input.questionCount,
            error,
        );

        if (recovered) {
            stashPlayLoadHandoff(
                sessionId,
                input,
                snapshotData,
                input.timedEndsAt != null
                    ? new Date(
                          Date.now() +
                              (input.timedDurationSeconds ?? 60) * 1000,
                      )
                    : null,
                recovered.startedAt,
            );
            return { id: recovered.id };
        }

        if (!isTransientDirectPgError(error)) {
            await cleanupQuizSessionById(sessionId);
        }

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
