/**
 * «Вызов другу»: строки FriendChallenge и попытки друзей.
 *
 * Вызов = замороженный список вопросов партии автора + его результат
 * (скопирован: страница вызова читает одну строку). Список берём из
 * `QuizResult.reviewPayload` — лёгкого разбора, который пишет сдача;
 * `snapshotData` (TOAST) не читаем никогда. Всё здесь — вне горячего пути:
 * создание — по кнопке на результате, чтение — страница вызова и блок
 * сравнения. Старт попытки идёт обычным путём (pick по id → create).
 *
 * Только скаляры и короткие JSON-массивы; `passwordHash` / email не
 * выбираем. Canon: docs/DECISIONS.md → Friend challenge.
 */

import { randomBytes } from 'node:crypto';

import type { Client } from 'pg';

import { withDirectPgClient, withDirectPgWriteClient } from '@/lib/db/direct-pg';
import type { Difficulty, QuizSessionPoolKind } from '@/types';

/** 8 случайных байт → 11 символов base64url: короткая ссылка, 64 бита. */
const CHALLENGE_ID_BYTES = 8;
const CHALLENGE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const TAKERS_LIMIT = 50;

export function isFriendChallengeId(value: string): boolean {
    return CHALLENGE_ID_PATTERN.test(value);
}

function newChallengeId(): string {
    return randomBytes(CHALLENGE_ID_BYTES).toString('base64url');
}

export type FriendChallenge = {
    id: string;
    /** null — аккаунт автора удалён. */
    creatorUserId: string | null;
    creatorUsername: string | null;
    creatorImage: string | null;
    difficulty: Difficulty | null;
    poolKind: QuizSessionPoolKind;
    questionCount: number;
    questionIds: string[];
    creatorScore: number;
    creatorCorrectCount: number;
    /** Верно / нет по вопросам в порядке партии. */
    creatorMarks: boolean[];
};

/** Партия-источник, как её видит проверка «можно ли вызвать». */
export type ChallengeSourceSession = {
    status: string;
    difficulty: Difficulty | null;
    poolKind: QuizSessionPoolKind;
    questionCount: number;
    isDaily: boolean;
    isTimed: boolean;
    isSurvival: boolean;
    hasTopic: boolean;
    isFriendChallenge: boolean;
    score: number;
    correctCount: number;
    /** [questionId, верно?] по позициям; null — разбора нет (старая партия). */
    marks: Array<{ questionId: string; isCorrect: boolean }> | null;
};

export type ChallengeAttempt = {
    sessionId: string;
    status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
};

export type ChallengeTaker = {
    userId: string;
    username: string;
    image: string | null;
    score: number;
    correctCount: number;
    completedAt: Date;
};

type ChallengeRow = {
    id: string;
    creator_user_id: string | null;
    creator_username: string | null;
    creator_image: string | null;
    difficulty: Difficulty | null;
    pool_kind: string;
    question_count: number;
    question_ids: unknown;
    creator_score: number;
    creator_correct_count: number;
    creator_marks: unknown;
};

function parseStringArray(value: unknown): string[] | null {
    return Array.isArray(value) && value.every((item) => typeof item === 'string')
        ? value
        : null;
}

function parseBooleanArray(value: unknown): boolean[] | null {
    return Array.isArray(value) && value.every((item) => typeof item === 'boolean')
        ? value
        : null;
}

function parsePoolKind(value: string): QuizSessionPoolKind {
    return value === 'MIXED' ? 'MIXED' : 'SINGLE';
}

function mapChallengeRow(row: ChallengeRow): FriendChallenge | null {
    const questionIds = parseStringArray(row.question_ids);
    const creatorMarks = parseBooleanArray(row.creator_marks);

    if (!questionIds || !creatorMarks) {
        return null;
    }

    return {
        id: row.id,
        creatorUserId: row.creator_user_id,
        creatorUsername: row.creator_username,
        creatorImage: row.creator_image,
        difficulty: row.difficulty,
        poolKind: parsePoolKind(row.pool_kind),
        questionCount: row.question_count,
        questionIds,
        creatorScore: row.creator_score,
        creatorCorrectCount: row.creator_correct_count,
        creatorMarks,
    };
}

async function queryChallenge(
    client: Client,
    challengeId: string,
): Promise<FriendChallenge | null> {
    const result = await client.query<ChallengeRow>(
        `
            SELECT
                fc."id",
                fc."creatorUserId" AS "creator_user_id",
                u."username" AS "creator_username",
                u."image" AS "creator_image",
                fc."difficulty",
                fc."poolKind"::text AS "pool_kind",
                fc."questionCount" AS "question_count",
                fc."questionIds" AS "question_ids",
                fc."creatorScore" AS "creator_score",
                fc."creatorCorrectCount" AS "creator_correct_count",
                fc."creatorMarks" AS "creator_marks"
            FROM "FriendChallenge" fc
            LEFT JOIN "User" u ON u."id" = fc."creatorUserId"
            WHERE fc."id" = $1
            LIMIT 1
        `,
        [challengeId],
    );

    const row = result.rows[0];
    return row ? mapChallengeRow(row) : null;
}

async function queryAttempt(
    client: Client,
    userId: string,
    challengeId: string,
): Promise<ChallengeAttempt | null> {
    const result = await client.query<{ id: string; status: ChallengeAttempt['status'] }>(
        `
            SELECT "id", "status"::text AS "status"
            FROM "QuizSession"
            WHERE "userId" = $1 AND "friendChallengeId" = $2
            LIMIT 1
        `,
        [userId, challengeId],
    );

    const row = result.rows[0];
    return row ? { sessionId: row.id, status: row.status } : null;
}

/** Кто сыграл вызов: лучший счёт, потом больше верных, потом кто раньше. */
async function queryTakers(
    client: Client,
    challengeId: string,
): Promise<ChallengeTaker[]> {
    const result = await client.query<{
        user_id: string;
        username: string;
        image: string | null;
        score: number;
        correct_count: number;
        completed_at: Date;
    }>(
        `
            SELECT
                u."id" AS "user_id",
                u."username",
                u."image",
                r."score",
                r."correctCount" AS "correct_count",
                r."completedAt" AS "completed_at"
            FROM "QuizSession" s
            INNER JOIN "QuizResult" r ON r."sessionId" = s."id"
            INNER JOIN "User" u ON u."id" = s."userId"
            WHERE s."friendChallengeId" = $1
              AND s."status" = 'COMPLETED'::"QuizSessionStatus"
            ORDER BY r."score" DESC, r."correctCount" DESC, r."completedAt" ASC
            LIMIT ${TAKERS_LIMIT}
        `,
        [challengeId],
    );

    return result.rows.map((row) => ({
        userId: row.user_id,
        username: row.username,
        image: row.image,
        score: row.score,
        correctCount: row.correct_count,
        completedAt: row.completed_at,
    }));
}

type SourceRow = {
    status: string;
    difficulty: Difficulty | null;
    pool_kind: string;
    question_count: number;
    is_daily: boolean;
    is_timed: boolean;
    is_survival: boolean;
    has_topic: boolean;
    is_friend_challenge: boolean;
    score: number;
    correct_count: number;
    marks: unknown;
    existing_id: string | null;
    existing_marks: unknown;
};

function parseMarks(
    value: unknown,
): Array<{ questionId: string; isCorrect: boolean }> | null {
    if (!Array.isArray(value)) {
        return null;
    }

    const marks: Array<{ questionId: string; isCorrect: boolean }> = [];

    for (const item of value) {
        if (
            !Array.isArray(item) ||
            typeof item[0] !== 'string' ||
            typeof item[1] !== 'boolean'
        ) {
            return null;
        }
        marks.push({ questionId: item[0], isCorrect: item[1] });
    }

    return marks;
}

/**
 * Партия игрока + уже созданный из неё вызов. Пары [id, верно?] — из
 * `reviewPayload.items` по `position`; JSON целиком в приложение не тянем.
 */
async function querySource(
    client: Client,
    sessionId: string,
    userId: string,
): Promise<{
    source: ChallengeSourceSession;
    existing: { id: string; marks: boolean[] } | null;
} | null> {
    const result = await client.query<SourceRow>(
        `
            SELECT
                s."status"::text AS "status",
                s."difficulty",
                s."poolKind"::text AS "pool_kind",
                s."questionCount" AS "question_count",
                (s."dailyChallengeId" IS NOT NULL) AS "is_daily",
                (s."timedEndsAt" IS NOT NULL) AS "is_timed",
                (s."survivalRunId" IS NOT NULL) AS "is_survival",
                (s."topicTagId" IS NOT NULL) AS "has_topic",
                (s."friendChallengeId" IS NOT NULL) AS "is_friend_challenge",
                r."score",
                r."correctCount" AS "correct_count",
                (
                    SELECT jsonb_agg(
                        jsonb_build_array(
                            item->>'questionId',
                            (item->>'isCorrect')::boolean
                        )
                        ORDER BY (item->>'position')::int
                    )
                    FROM jsonb_array_elements(r."reviewPayload"->'items') AS item
                ) AS "marks",
                fc."id" AS "existing_id",
                fc."creatorMarks" AS "existing_marks"
            FROM "QuizSession" s
            INNER JOIN "QuizResult" r ON r."sessionId" = s."id"
            LEFT JOIN "FriendChallenge" fc ON fc."sourceSessionId" = s."id"
            WHERE s."id" = $1 AND s."userId" = $2
            LIMIT 1
        `,
        [sessionId, userId],
    );

    const row = result.rows[0];

    if (!row) {
        return null;
    }

    const existingMarks = parseBooleanArray(row.existing_marks);

    return {
        existing:
            row.existing_id && existingMarks
                ? { id: row.existing_id, marks: existingMarks }
                : null,
        source: {
            status: row.status,
            difficulty: row.difficulty,
            poolKind: parsePoolKind(row.pool_kind),
            questionCount: row.question_count,
            isDaily: row.is_daily,
            isTimed: row.is_timed,
            isSurvival: row.is_survival,
            hasTopic: row.has_topic,
            isFriendChallenge: row.is_friend_challenge,
            score: row.score,
            correctCount: row.correct_count,
            marks: parseMarks(row.marks),
        },
    };
}

function isUniqueViolation(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === '23505'
    );
}

export type CreateChallengeResult =
    /** creatorMarks — для текста ссылки (квадратики), без ожидания разбора. */
    | { ok: true; challengeId: string; creatorMarks: boolean[] }
    | { ok: false; reason: 'not_found' | 'not_eligible' };

export const friendChallengeRepository = {
    /**
     * Вызов из партии игрока; повторный вызов той же партии отдаёт тот же id.
     * `isEligible` — правило фичи (только Классика и т. п.), entity его не знает.
     */
    async createFromSession(input: {
        sessionId: string;
        userId: string;
        isEligible: (source: ChallengeSourceSession) => boolean;
    }): Promise<CreateChallengeResult> {
        return withDirectPgWriteClient(
            async (client) => {
                const found = await querySource(client, input.sessionId, input.userId);

                if (!found) {
                    return { ok: false, reason: 'not_found' } as const;
                }

                if (found.existing) {
                    return {
                        ok: true,
                        challengeId: found.existing.id,
                        creatorMarks: found.existing.marks,
                    } as const;
                }

                const { source } = found;

                if (!input.isEligible(source) || !source.marks) {
                    return { ok: false, reason: 'not_eligible' } as const;
                }

                const questionIds = source.marks.map((mark) => mark.questionId);
                const creatorMarks = source.marks.map((mark) => mark.isCorrect);

                // PK — случайный: при (почти невозможном) совпадении — ещё раз.
                for (let attempt = 0; attempt < 2; attempt += 1) {
                    try {
                        const inserted = await client.query<{ id: string }>(
                            `
                                INSERT INTO "FriendChallenge" (
                                    "id",
                                    "creatorUserId",
                                    "sourceSessionId",
                                    "difficulty",
                                    "poolKind",
                                    "questionCount",
                                    "questionIds",
                                    "creatorScore",
                                    "creatorCorrectCount",
                                    "creatorMarks"
                                )
                                VALUES (
                                    $1, $2, $3,
                                    $4::"Difficulty",
                                    $5::"QuizSessionPoolKind",
                                    $6, $7::jsonb, $8, $9, $10::jsonb
                                )
                                ON CONFLICT ("sourceSessionId") DO NOTHING
                                RETURNING "id"
                            `,
                            [
                                newChallengeId(),
                                input.userId,
                                input.sessionId,
                                source.difficulty,
                                source.poolKind,
                                source.questionCount,
                                JSON.stringify(questionIds),
                                source.score,
                                source.correctCount,
                                JSON.stringify(creatorMarks),
                            ],
                        );

                        const createdId = inserted.rows[0]?.id;
                        if (createdId) {
                            return { ok: true, challengeId: createdId, creatorMarks } as const;
                        }

                        // Двойное нажатие: вызов уже создан параллельным запросом.
                        const existing = await client.query<{ id: string }>(
                            `SELECT "id" FROM "FriendChallenge" WHERE "sourceSessionId" = $1`,
                            [input.sessionId],
                        );
                        const existingId = existing.rows[0]?.id;
                        if (existingId) {
                            return { ok: true, challengeId: existingId, creatorMarks } as const;
                        }
                    } catch (error) {
                        if (!isUniqueViolation(error) || attempt === 1) {
                            throw error;
                        }
                    }
                }

                throw new Error('FriendChallenge insert returned no id');
            },
            { debugLabel: 'friend-challenge.create' },
        );
    },

    /**
     * Страница вызова: вызов, попытка смотрящего (если вошёл) и список
     * сыгравших — на одном клиенте, три коротких скалярных запроса.
     */
    async findPageState(
        challengeId: string,
        viewerUserId: string | null,
    ): Promise<{
        challenge: FriendChallenge;
        attempt: ChallengeAttempt | null;
        takers: ChallengeTaker[];
    } | null> {
        return withDirectPgClient(
            async (client) => {
                const challenge = await queryChallenge(client, challengeId);

                if (!challenge) {
                    return null;
                }

                const attempt = viewerUserId
                    ? await queryAttempt(client, viewerUserId, challengeId)
                    : null;
                const takers = await queryTakers(client, challengeId);

                return { challenge, attempt, takers };
            },
            { debugLabel: 'friend-challenge.page' },
        );
    },

    /** Старт попытки: вызов + уже существующая попытка игрока. */
    async findForStart(
        challengeId: string,
        userId: string,
    ): Promise<{ challenge: FriendChallenge; attempt: ChallengeAttempt | null } | null> {
        return withDirectPgClient(
            async (client) => {
                const challenge = await queryChallenge(client, challengeId);

                if (!challenge) {
                    return null;
                }

                return {
                    challenge,
                    attempt: await queryAttempt(client, userId, challengeId),
                };
            },
            { debugLabel: 'friend-challenge.start' },
        );
    },

    /**
     * Блок сравнения на результате друга: вызов + его ответы по вопросам
     * (строки QuizAnswer, без JSONB). Только своя сессия.
     */
    async findVersus(
        challengeId: string,
        sessionId: string,
        userId: string,
    ): Promise<{
        challenge: FriendChallenge;
        answers: Map<string, boolean>;
    } | null> {
        return withDirectPgClient(
            async (client) => {
                const challenge = await queryChallenge(client, challengeId);

                if (!challenge) {
                    return null;
                }

                const result = await client.query<{
                    question_id: string;
                    is_correct: boolean;
                }>(
                    `
                        SELECT a."questionId" AS "question_id", a."isCorrect" AS "is_correct"
                        FROM "QuizAnswer" a
                        INNER JOIN "QuizSession" s ON s."id" = a."sessionId"
                        WHERE a."sessionId" = $1 AND s."userId" = $2
                    `,
                    [sessionId, userId],
                );

                return {
                    challenge,
                    answers: new Map(
                        result.rows.map((row) => [row.question_id, row.is_correct]),
                    ),
                };
            },
            { debugLabel: 'friend-challenge.versus' },
        );
    },

    /** Для превью-картинки и метаданных: только вызов. */
    async findById(challengeId: string): Promise<FriendChallenge | null> {
        return withDirectPgClient(
            (client) => queryChallenge(client, challengeId),
            { debugLabel: 'friend-challenge.read' },
        );
    },
};
