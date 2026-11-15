/**
 * Комната с кодом (ROADMAP 5.5, ступень 2): строки Room / RoomPlayer /
 * RoomQuestion / RoomAnswer.
 *
 * Всё — raw `pg` на `withPooledPgClient`, вне Direct-очереди горячего пути:
 * комната не трогает QuizSession, сдачу, lock-in и рейтинг. Payload вопроса —
 * ~1 КБ (ниже порога TOAST), `snapshotData` не читается никогда.
 *
 * Времена — TIMESTAMPTZ, параметры — JS Date (canon E: без SQL NOW() в часах).
 * Верный ключ варианта выходит из репозитория только для раскрытых вопросов
 * (`closeAt <= now`); решает это SQL, а не вызывающий код.
 *
 * Canon: docs/DECISIONS.md → Quiz room.
 */

import { randomUUID } from 'node:crypto';

import type { Client } from 'pg';

import { withPooledPgClient } from '@/lib/db/direct-pg';
import { ROOM_MAX_PLAYERS, ROOM_TIMING } from '@/features/quiz-room/lib/room-rules';
import type { Difficulty, QuestionType, QuizSessionPoolKind } from '@/types';

/**
 * Бюджет одного захода в БД. На проде (fra1 ↔ Neon Frankfurt) запрос —
 * миллисекунды, 8 с — потолок от зависшего сокета. Локальный `next dev` на
 * Windows ходит в Neon через океан (соединение 2–5 с) — там бюджет шире,
 * чтобы проверять комнату локально; на прод это не влияет.
 */
const IS_DEV_LAB = process.env.NODE_ENV !== 'production';
const ROOM_HOP_TIMEOUT_MS = IS_DEV_LAB ? 20_000 : 8_000;
/** Старт собирает до 20 вопросов с переводами — дольше обычного hop. */
const ROOM_START_TIMEOUT_MS = IS_DEV_LAB ? 45_000 : 20_000;
/** Комната любого статуса старше этого отдаёт код новой. */
const ROOM_CODE_RECLAIM_MS = 3 * 60 * 60_000;
/** STARTING дольше этого — сбой старта: комната возвращается в лобби. */
export const ROOM_STARTING_STALE_MS = 30_000;

export type RoomStatus = 'LOBBY' | 'STARTING' | 'PLAYING' | 'FINISHED' | 'CLOSED';
export type RoomPlayerStatus = 'ACTIVE' | 'LEFT' | 'KICKED';

export type RoomLocalizedText = { ru: string; en: string };

/** Замороженный вопрос (RoomQuestion.payload). Верного ключа здесь нет. */
export type RoomQuestionPayload = {
    v: 1;
    type: QuestionType;
    difficulty: Difficulty;
    imageUrl: string | null;
    text: RoomLocalizedText;
    options: Array<{ key: string; text: RoomLocalizedText }>;
};

export type RoomRow = {
    id: string;
    code: string | null;
    status: RoomStatus;
    hostUserId: string | null;
    questionCount: number;
    difficulty: Difficulty | null;
    poolKind: QuizSessionPoolKind;
    topicTagId: string | null;
    topicNameRu: string | null;
    topicNameEn: string | null;
    answerSeconds: number;
    speedScoring: boolean;
    startedAt: Date | null;
    finishedAt: Date | null;
    nextRoomCode: string | null;
    createdAt: Date;
};

export type RoomPlayerRow = {
    id: string;
    userId: string;
    nickname: string;
    status: RoomPlayerStatus;
    joinedAt: Date;
    lastSeenAt: Date;
    image: string | null;
};

export type RoomQuestionTimesRow = {
    position: number;
    introAt: Date;
    openAt: Date;
    closeAt: Date;
    /** Только для раскрытых вопросов (closeAt <= now), иначе null. */
    correctKey: string | null;
};

export type RoomAnswerRow = {
    playerId: string;
    position: number;
    optionKey: string;
    isCorrect: boolean;
    points: number;
    answeredAt: Date;
};

export type RoomSnapshot = {
    room: RoomRow;
    players: RoomPlayerRow[];
    questions: RoomQuestionTimesRow[];
    answers: RoomAnswerRow[];
    /** Последний показанный вопрос (introAt <= now) и его payload. */
    current: { position: number; payload: RoomQuestionPayload } | null;
};

export type RoomSettingsWrite = {
    questionCount: number;
    difficulty: Difficulty | null;
    poolKind: QuizSessionPoolKind;
    topicTagId: string | null;
    answerSeconds: number;
    speedScoring: boolean;
};

const ROOM_SELECT_SQL = `
    r."id",
    r."code",
    r."status"::text AS "status",
    r."hostUserId",
    r."questionCount",
    r."difficulty"::text AS "difficulty",
    r."poolKind"::text AS "poolKind",
    r."topicTagId",
    topic."nameRu" AS "topicNameRu",
    topic."nameEn" AS "topicNameEn",
    r."answerSeconds",
    r."speedScoring",
    r."startedAt",
    r."finishedAt",
    r."nextRoomCode",
    r."createdAt"
`;

function pooled<T>(
    label: string,
    operation: (client: Client) => Promise<T>,
    attemptTimeoutMs = ROOM_HOP_TIMEOUT_MS,
): Promise<T> {
    return withPooledPgClient(operation, {
        debugLabel: `room.${label}`,
        attemptTimeoutMs,
    });
}

export type CreateRoomInput = {
    hostUserId: string;
    nickname: string;
    code: string;
    settings: RoomSettingsWrite;
    now: Date;
};

export type JoinRoomOutcome =
    | { kind: 'joined'; playerId: string }
    | { kind: 'not_found' }
    | { kind: 'member'; playerId: string }
    | { kind: 'closed' }
    | { kind: 'started' }
    | { kind: 'full' }
    | { kind: 'kicked' };

export type SubmitRoomAnswerContext = {
    roomId: string;
    status: RoomStatus;
    answerSeconds: number;
    speedScoring: boolean;
    openAt: Date;
    closeAt: Date;
    correctKey: string;
    optionKeys: string[];
    playerId: string;
    playerStatus: RoomPlayerStatus;
};

export const quizRoomRepository = {
    /**
     * Новая комната с ведущим-игроком. Прежнее лобби ведущего закрывается
     * (одна открытая комната на ведущего). Код: если его держит сыгранная,
     * закрытая или брошенная комната — освобождаем (NULL) и берём; занят
     * живой комнатой — null, вызывающий пробует другой код.
     */
    async createRoom(input: CreateRoomInput): Promise<{ id: string } | null> {
        return pooled('create', async (client) => {
            await client.query(
                `
                    UPDATE "Room"
                    SET "status" = 'CLOSED'::"RoomStatus"
                    WHERE "hostUserId" = $1 AND "status" = 'LOBBY'::"RoomStatus"
                `,
                [input.hostUserId],
            );

            await client.query(
                `
                    UPDATE "Room"
                    SET "code" = NULL
                    WHERE
                        "code" = $1
                        AND (
                            "status" IN ('FINISHED'::"RoomStatus", 'CLOSED'::"RoomStatus")
                            OR "createdAt" < $2
                            OR ("status" = 'LOBBY'::"RoomStatus" AND "createdAt" < $3)
                        )
                `,
                [
                    input.code,
                    new Date(input.now.getTime() - ROOM_CODE_RECLAIM_MS),
                    new Date(input.now.getTime() - ROOM_TIMING.lobbyTtlMs),
                ],
            );

            const roomId = randomUUID();
            const { settings } = input;
            // Один statement: комната и ведущий-игрок появляются вместе.
            const result = await client.query<{ id: string }>(
                `
                    WITH room AS (
                        INSERT INTO "Room" (
                            "id", "code", "hostUserId", "status",
                            "questionCount", "difficulty", "poolKind", "topicTagId",
                            "answerSeconds", "speedScoring", "createdAt"
                        )
                        VALUES (
                            $1, $2, $3, 'LOBBY'::"RoomStatus",
                            $4, $5::"Difficulty", $6::"QuizSessionPoolKind", $7,
                            $8, $9, $10
                        )
                        ON CONFLICT ("code") DO NOTHING
                        RETURNING "id"
                    )
                    INSERT INTO "RoomPlayer" (
                        "id", "roomId", "userId", "nickname", "status",
                        "joinedAt", "lastSeenAt"
                    )
                    SELECT $11, room."id", $3, $12, 'ACTIVE'::"RoomPlayerStatus", $10, $10
                    FROM room
                    RETURNING "roomId" AS "id"
                `,
                [
                    roomId,
                    input.code,
                    input.hostUserId,
                    settings.questionCount,
                    settings.difficulty,
                    settings.poolKind,
                    settings.topicTagId,
                    settings.answerSeconds,
                    settings.speedScoring,
                    input.now,
                    randomUUID(),
                    input.nickname,
                ],
            );

            return result.rows[0] ?? null;
        });
    },

    /** Комната по коду: самая свежая с этим кодом (код уникален, но NULL-ы — нет). */
    async findRoomByCode(code: string): Promise<RoomRow | null> {
        const result = await pooled('find', (client) =>
            client.query<RoomRow>(
                `
                    SELECT ${ROOM_SELECT_SQL}
                    FROM "Room" r
                    LEFT JOIN "Tag" topic ON topic."id" = r."topicTagId"
                    WHERE r."code" = $1
                `,
                [code],
            ),
        );

        return result.rows[0] ?? null;
    },

    /** Игроки комнаты (без чужих userId наружу — это делает сервис). */
    async findPlayers(roomId: string): Promise<RoomPlayerRow[]> {
        const result = await pooled('players', (client) =>
            client.query<RoomPlayerRow>(
                `
                    SELECT
                        p."id", p."userId", p."nickname", p."status"::text AS "status",
                        p."joinedAt", p."lastSeenAt", u."image"
                    FROM "RoomPlayer" p
                    JOIN "User" u ON u."id" = p."userId"
                    WHERE p."roomId" = $1
                    ORDER BY p."joinedAt" ASC, p."id" ASC
                `,
                [roomId],
            ),
        );

        return result.rows;
    },

    /**
     * Вход в лобби по коду на одном соединении: комната и занятые имена →
     * `pickNickname` (сервис подбирает свободное имя) → условный INSERT
     * (комната в лобби и не брошена, мест хватает). Вышедший сам (LEFT)
     * возвращается; убранный ведущим (KICKED) — нет. Гонка за последнее
     * место может дать 13-го игрока — допустимо, игра от этого не ломается.
     */
    async joinByCode(input: {
        code: string;
        userId: string;
        now: Date;
        pickNickname: (taken: string[]) => string;
    }): Promise<JoinRoomOutcome> {
        return pooled('join', async (client) => {
            const found = await client.query<{
                id: string;
                status: RoomStatus;
                createdAt: Date;
                playerId: string | null;
                playerStatus: RoomPlayerStatus | null;
                taken: string[] | null;
            }>(
                `
                    SELECT
                        r."id",
                        r."status"::text AS "status",
                        r."createdAt",
                        me."id" AS "playerId",
                        me."status"::text AS "playerStatus",
                        ARRAY(
                            SELECT a."nickname" FROM "RoomPlayer" a
                            WHERE a."roomId" = r."id"
                              AND a."status" = 'ACTIVE'::"RoomPlayerStatus"
                              AND a."userId" <> $2
                        ) AS "taken"
                    FROM "Room" r
                    LEFT JOIN "RoomPlayer" me ON me."roomId" = r."id" AND me."userId" = $2
                    WHERE r."code" = $1
                `,
                [input.code, input.userId],
            );
            const room = found.rows[0];

            if (!room) return { kind: 'not_found' };
            if (room.playerStatus === 'KICKED') return { kind: 'kicked' };
            if (room.playerId && room.playerStatus === 'ACTIVE') {
                return { kind: 'member', playerId: room.playerId };
            }
            if (room.status === 'CLOSED') return { kind: 'closed' };
            if (room.status !== 'LOBBY') return { kind: 'started' };
            if (room.createdAt.getTime() < input.now.getTime() - ROOM_TIMING.lobbyTtlMs) {
                return { kind: 'closed' };
            }

            const inserted = await client.query<{ id: string }>(
                `
                    INSERT INTO "RoomPlayer" (
                        "id", "roomId", "userId", "nickname", "status",
                        "joinedAt", "lastSeenAt"
                    )
                    SELECT $1, r."id", $3, $4, 'ACTIVE'::"RoomPlayerStatus", $5, $5
                    FROM "Room" r
                    WHERE
                        r."id" = $2
                        AND r."status" = 'LOBBY'::"RoomStatus"
                        AND (
                            SELECT COUNT(*)
                            FROM "RoomPlayer" p
                            WHERE p."roomId" = r."id" AND p."status" = 'ACTIVE'::"RoomPlayerStatus"
                        ) < $6
                    ON CONFLICT ("roomId", "userId") DO UPDATE
                        SET
                            "status" = 'ACTIVE'::"RoomPlayerStatus",
                            "nickname" = EXCLUDED."nickname",
                            "lastSeenAt" = EXCLUDED."lastSeenAt"
                        WHERE "RoomPlayer"."status" = 'LEFT'::"RoomPlayerStatus"
                    RETURNING "id"
                `,
                [
                    randomUUID(),
                    room.id,
                    input.userId,
                    input.pickNickname(room.taken ?? []),
                    input.now,
                    ROOM_MAX_PLAYERS,
                ],
            );

            // Не вставили: мест нет (или ведущий как раз нажал «Начать»).
            return inserted.rows[0]
                ? { kind: 'joined', playerId: inserted.rows[0].id }
                : { kind: 'full' };
        });
    },

    /** Настройки — только ведущий и только в лобби. */
    async updateSettings(
        roomId: string,
        hostUserId: string,
        settings: RoomSettingsWrite,
    ): Promise<boolean> {
        const result = await pooled('settings', (client) =>
            client.query(
                `
                    UPDATE "Room"
                    SET
                        "questionCount" = $3,
                        "difficulty" = $4::"Difficulty",
                        "poolKind" = $5::"QuizSessionPoolKind",
                        "topicTagId" = $6,
                        "answerSeconds" = $7,
                        "speedScoring" = $8
                    WHERE "id" = $1 AND "hostUserId" = $2 AND "status" = 'LOBBY'::"RoomStatus"
                `,
                [
                    roomId,
                    hostUserId,
                    settings.questionCount,
                    settings.difficulty,
                    settings.poolKind,
                    settings.topicTagId,
                    settings.answerSeconds,
                    settings.speedScoring,
                ],
            ),
        );

        return (result.rowCount ?? 0) > 0;
    },

    /** Тема существует и это тема игры (playOrder) — иначе пул пуст. */
    async isPlayTopic(topicTagId: string): Promise<boolean> {
        const result = await pooled('topic', (client) =>
            client.query(
                `SELECT 1 FROM "Tag" WHERE "id" = $1 AND "playOrder" IS NOT NULL`,
                [topicTagId],
            ),
        );

        return (result.rowCount ?? 0) > 0;
    },

    /** Убрать игрока из лобби (ведущий; себя убрать нельзя). */
    async kickPlayer(roomId: string, hostUserId: string, playerId: string): Promise<boolean> {
        const result = await pooled('kick', (client) =>
            client.query(
                `
                    UPDATE "RoomPlayer" p
                    SET "status" = 'KICKED'::"RoomPlayerStatus"
                    FROM "Room" r
                    WHERE
                        p."id" = $3
                        AND p."roomId" = $1
                        AND r."id" = p."roomId"
                        AND r."hostUserId" = $2
                        AND p."userId" <> $2
                        AND r."status" = 'LOBBY'::"RoomStatus"
                `,
                [roomId, hostUserId, playerId],
            ),
        );

        return (result.rowCount ?? 0) > 0;
    },

    /**
     * Выйти из лобби. Ведущий выходит — комната закрывается (без ведущего
     * её некому начать).
     */
    async leaveLobby(roomId: string, userId: string): Promise<void> {
        await pooled('leave', async (client) => {
            await client.query(
                `
                    UPDATE "RoomPlayer"
                    SET "status" = 'LEFT'::"RoomPlayerStatus"
                    WHERE "roomId" = $1 AND "userId" = $2 AND "status" = 'ACTIVE'::"RoomPlayerStatus"
                `,
                [roomId, userId],
            );
            await client.query(
                `
                    UPDATE "Room"
                    SET "status" = 'CLOSED'::"RoomStatus"
                    WHERE "id" = $1 AND "hostUserId" = $2 AND "status" = 'LOBBY'::"RoomStatus"
                `,
                [roomId, userId],
            );
        });
    },

    async setNickname(roomId: string, userId: string, nickname: string): Promise<boolean> {
        const result = await pooled('nickname', (client) =>
            client.query(
                `
                    UPDATE "RoomPlayer" p
                    SET "nickname" = $3
                    FROM "Room" r
                    WHERE
                        p."roomId" = $1
                        AND p."userId" = $2
                        AND p."status" = 'ACTIVE'::"RoomPlayerStatus"
                        AND r."id" = p."roomId"
                        AND r."status" = 'LOBBY'::"RoomStatus"
                `,
                [roomId, userId, nickname],
            ),
        );

        return (result.rowCount ?? 0) > 0;
    },

    /**
     * Ведущий нажал «Начать»: LOBBY → STARTING, если игроков хватает.
     * `startedAt` здесь — метка начала сборки (для восстановления после
     * сбоя); настоящий старт пишет `finishStart`.
     */
    async claimStart(
        roomId: string,
        hostUserId: string,
        minPlayers: number,
        now: Date,
    ): Promise<RoomRow | null> {
        const result = await pooled('start.claim', (client) =>
            client.query<RoomRow>(
                `
                    WITH claimed AS (
                        UPDATE "Room" r
                        SET "status" = 'STARTING'::"RoomStatus", "startedAt" = $4
                        WHERE
                            r."id" = $1
                            AND r."hostUserId" = $2
                            AND r."status" = 'LOBBY'::"RoomStatus"
                            AND (
                                SELECT COUNT(*) FROM "RoomPlayer" p
                                WHERE p."roomId" = r."id" AND p."status" = 'ACTIVE'::"RoomPlayerStatus"
                            ) >= $3
                        RETURNING r.*
                    )
                    SELECT ${ROOM_SELECT_SQL}
                    FROM claimed r
                    LEFT JOIN "Tag" topic ON topic."id" = r."topicTagId"
                `,
                [roomId, hostUserId, minPlayers, now],
            ),
        );

        return result.rows[0] ?? null;
    },

    /** Пул вопросов для комнаты: опубликованные, активные, без музыки. */
    async loadQuestionPool(
        client: Client,
        difficulty: Difficulty | null,
        topicTagId: string | null,
    ): Promise<Array<{ id: string; difficulty: Difficulty }>> {
        const result = await client.query<{ id: string; difficulty: Difficulty }>(
            `
                SELECT q."id", q."difficulty"::text AS "difficulty"
                FROM "Question" q
                WHERE
                    q."isActive" = true
                    AND q."publicationStatus" = 'PUBLISHED'::"QuestionPublicationStatus"
                    AND q."type" <> 'AUDIO_GUESS'::"QuestionType"
                    AND ($1::text IS NULL OR q."difficulty" = $1::"Difficulty")
                    AND (
                        $2::text IS NULL
                        OR (
                            EXISTS (
                                SELECT 1 FROM "Tag" topic
                                WHERE topic."id" = $2 AND topic."playOrder" IS NOT NULL
                            )
                            AND EXISTS (
                                SELECT 1
                                FROM "QuestionTag" qt
                                JOIN "Tag" t ON t."id" = qt."tagId"
                                WHERE qt."questionId" = q."id"
                                  AND (t."id" = $2 OR t."parentId" = $2)
                            )
                        )
                    )
            `,
            [difficulty, topicTagId],
        );

        return result.rows;
    },

    /**
     * Сборка старта на одном pooled-клиенте: `build` выбирает и разворачивает
     * вопросы (с этим же клиентом) и возвращает строки RoomQuestion вместе с
     * моментом старта. Ошибка или «мало вопросов» → комната снова в лобби.
     */
    async finishStart(
        roomId: string,
        build: (client: Client) => Promise<{
            startedAt: Date;
            rows: Array<{
                position: number;
                questionId: string;
                payload: RoomQuestionPayload;
                correctKey: string;
                introAt: Date;
                openAt: Date;
                closeAt: Date;
            }>;
        } | null>,
    ): Promise<'started' | 'not_enough'> {
        return pooled(
            'start.build',
            async (client) => {
                try {
                    const built = await build(client);

                    if (!built) {
                        await revertStart(client, roomId);
                        return 'not_enough';
                    }

                    await client.query(`DELETE FROM "RoomQuestion" WHERE "roomId" = $1`, [roomId]);
                    await client.query(
                        `
                            INSERT INTO "RoomQuestion" (
                                "roomId", "position", "questionId", "payload", "correctKey",
                                "introAt", "openAt", "closeAt"
                            )
                            SELECT
                                $1,
                                (row->>'position')::int,
                                row->>'questionId',
                                row->'payload',
                                row->>'correctKey',
                                (row->>'introAt')::timestamptz,
                                (row->>'openAt')::timestamptz,
                                (row->>'closeAt')::timestamptz
                            FROM jsonb_array_elements($2::jsonb) AS row
                        `,
                        [
                            roomId,
                            JSON.stringify(
                                built.rows.map((row) => ({
                                    ...row,
                                    introAt: row.introAt.toISOString(),
                                    openAt: row.openAt.toISOString(),
                                    closeAt: row.closeAt.toISOString(),
                                })),
                            ),
                        ],
                    );
                    const updated = await client.query(
                        `
                            UPDATE "Room"
                            SET "status" = 'PLAYING'::"RoomStatus", "startedAt" = $2
                            WHERE "id" = $1 AND "status" = 'STARTING'::"RoomStatus"
                        `,
                        [roomId, built.startedAt],
                    );

                    if ((updated.rowCount ?? 0) === 0) {
                        throw new Error('Room left STARTING during start build');
                    }

                    return 'started';
                } catch (error) {
                    await revertStart(client, roomId).catch(() => undefined);
                    throw error;
                }
            },
            ROOM_START_TIMEOUT_MS,
        );
    },

    /**
     * Опрос состояния — один SQL statement: комната, игроки, расписание
     * (верный ключ — только раскрытым), ответы и payload последнего
     * показанного вопроса. В нём же — отметка «на связи» (не чаще раза в
     * 5 с) и ленивый переход доигранной игры в FINISHED. Один round trip
     * важен: опрос идёт раз в 1,5–2 с от каждого игрока.
     * Брошенный STARTING (сбой сборки > 30 с) возвращается в лобби отдельным
     * запросом — это редкость.
     */
    async readSnapshot(input: {
        code: string;
        userId: string | null;
        now: Date;
    }): Promise<RoomSnapshot | null> {
        return pooled('state', async (client) => {
            const result = await client.query<
                RoomRow & {
                    players: RoomPlayerRow[] | null;
                    questions: RoomQuestionTimesRow[] | null;
                    answers: RoomAnswerRow[] | null;
                    currentPosition: number | null;
                    currentPayload: RoomQuestionPayload | null;
                }
            >(
                `
                    WITH room AS (
                        SELECT ${ROOM_SELECT_SQL}
                        FROM "Room" r
                        LEFT JOIN "Tag" topic ON topic."id" = r."topicTagId"
                        WHERE r."code" = $1
                    ),
                    seen AS (
                        UPDATE "RoomPlayer" p
                        SET "lastSeenAt" = $3
                        FROM room
                        WHERE
                            p."roomId" = room."id"
                            AND p."userId" = $2
                            AND p."status" = 'ACTIVE'::"RoomPlayerStatus"
                            AND p."lastSeenAt" < $4
                        RETURNING p."id"
                    ),
                    finished AS (
                        UPDATE "Room" r
                        SET "status" = 'FINISHED'::"RoomStatus", "finishedAt" = ends."endsAt"
                        FROM (
                            SELECT
                                q."roomId",
                                MAX(q."closeAt") + make_interval(secs => $5::double precision) AS "endsAt"
                            FROM "RoomQuestion" q
                            JOIN room ON q."roomId" = room."id"
                            GROUP BY q."roomId"
                        ) ends
                        WHERE
                            r."id" = ends."roomId"
                            AND r."status" = 'PLAYING'::"RoomStatus"
                            AND ends."endsAt" <= $3
                        RETURNING r."finishedAt"
                    )
                    SELECT
                        room."id", room."code", room."hostUserId", room."questionCount",
                        room."difficulty", room."poolKind", room."topicTagId",
                        room."topicNameRu", room."topicNameEn", room."answerSeconds",
                        room."speedScoring", room."startedAt", room."nextRoomCode",
                        room."createdAt",
                        CASE WHEN EXISTS (SELECT 1 FROM finished) THEN 'FINISHED' ELSE room."status" END AS "status",
                        COALESCE((SELECT "finishedAt" FROM finished), room."finishedAt") AS "finishedAt",
                        (
                            SELECT json_agg(x ORDER BY x."joinedAt", x."id")
                            FROM (
                                SELECT
                                    p."id", p."userId", p."nickname", p."status"::text AS "status",
                                    p."joinedAt", p."lastSeenAt", u."image"
                                FROM "RoomPlayer" p
                                JOIN "User" u ON u."id" = p."userId"
                                WHERE p."roomId" = room."id"
                            ) x
                        ) AS "players",
                        (
                            SELECT json_agg(x ORDER BY x."position")
                            FROM (
                                SELECT
                                    q."position", q."introAt", q."openAt", q."closeAt",
                                    CASE WHEN q."closeAt" <= $3 THEN q."correctKey" END AS "correctKey"
                                FROM "RoomQuestion" q
                                WHERE q."roomId" = room."id"
                            ) x
                        ) AS "questions",
                        (
                            SELECT json_agg(x)
                            FROM (
                                SELECT
                                    a."playerId", a."position", a."optionKey", a."isCorrect",
                                    a."points", a."answeredAt"
                                FROM "RoomAnswer" a
                                WHERE a."roomId" = room."id"
                            ) x
                        ) AS "answers",
                        cur."position" AS "currentPosition",
                        cur."payload" AS "currentPayload"
                    FROM room
                    LEFT JOIN LATERAL (
                        SELECT q."position", q."payload"
                        FROM "RoomQuestion" q
                        WHERE q."roomId" = room."id" AND q."introAt" <= $3
                        ORDER BY q."position" DESC
                        LIMIT 1
                    ) cur ON TRUE
                `,
                [
                    input.code,
                    input.userId,
                    input.now,
                    new Date(input.now.getTime() - ROOM_TIMING.presenceWriteEveryMs),
                    ROOM_TIMING.revealMs / 1000,
                ],
            );
            const row = result.rows[0];

            if (!row) {
                return null;
            }

            const {
                players,
                questions,
                answers,
                currentPosition,
                currentPayload,
                ...roomColumns
            } = row;
            let room: RoomRow = roomColumns;

            if (
                room.status === 'STARTING' &&
                room.startedAt &&
                input.now.getTime() - room.startedAt.getTime() > ROOM_STARTING_STALE_MS
            ) {
                await revertStart(client, room.id);
                room = { ...room, status: 'LOBBY', startedAt: null };
            }

            const toDate = (value: unknown) => new Date(value as string);

            return {
                room,
                players: (players ?? []).map((player) => ({
                    ...player,
                    joinedAt: toDate(player.joinedAt),
                    lastSeenAt: toDate(player.lastSeenAt),
                })),
                questions: (questions ?? []).map((question) => ({
                    ...question,
                    introAt: toDate(question.introAt),
                    openAt: toDate(question.openAt),
                    closeAt: toDate(question.closeAt),
                })),
                answers: (answers ?? []).map((answer) => ({
                    ...answer,
                    answeredAt: toDate(answer.answeredAt),
                })),
                current:
                    currentPosition !== null && currentPayload
                        ? { position: currentPosition, payload: currentPayload }
                        : null,
            };
        });
    },

    /**
     * Ответ на одном соединении: контекст (времена, ключи, игрок) → решение
     * сервиса (`decide`: окно, верность, очки) → INSERT (первый ответ
     * побеждает) → досрочное закрытие, если ответили все, кто на связи.
     */
    async submitAnswer(
        input: { code: string; userId: string; position: number },
        decide: (context: SubmitRoomAnswerContext) =>
            | { kind: 'insert'; optionKey: string; isCorrect: boolean; points: number; answeredAt: Date }
            | { kind: 'reject' },
    ): Promise<
        | { kind: 'not_found' }
        | { kind: 'rejected'; context: SubmitRoomAnswerContext; ownAnswer: string | null }
        | { kind: 'inserted' }
        | { kind: 'replay' }
    > {
        return pooled('answer', async (client) => {
            const found = await client.query<SubmitRoomAnswerContext>(
                `
                    SELECT
                        r."id" AS "roomId",
                        r."status"::text AS "status",
                        r."answerSeconds",
                        r."speedScoring",
                        q."openAt",
                        q."closeAt",
                        q."correctKey",
                        ARRAY(
                            SELECT o->>'key' FROM jsonb_array_elements(q."payload"->'options') o
                        ) AS "optionKeys",
                        p."id" AS "playerId",
                        p."status"::text AS "playerStatus"
                    FROM "Room" r
                    JOIN "RoomQuestion" q ON q."roomId" = r."id" AND q."position" = $3
                    JOIN "RoomPlayer" p ON p."roomId" = r."id" AND p."userId" = $2
                    WHERE r."code" = $1
                `,
                [input.code, input.userId, input.position],
            );
            const context = found.rows[0];

            if (!context) {
                return { kind: 'not_found' };
            }

            const decision = decide(context);

            if (decision.kind === 'reject') {
                const own = await client.query<{ optionKey: string }>(
                    `
                        SELECT "optionKey" FROM "RoomAnswer"
                        WHERE "roomId" = $1 AND "position" = $2 AND "playerId" = $3
                    `,
                    [context.roomId, input.position, context.playerId],
                );

                return {
                    kind: 'rejected',
                    context,
                    ownAnswer: own.rows[0]?.optionKey ?? null,
                };
            }

            const inserted = await client.query(
                `
                    INSERT INTO "RoomAnswer" (
                        "roomId", "position", "playerId", "optionKey",
                        "isCorrect", "points", "answeredAt"
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT ("roomId", "position", "playerId") DO NOTHING
                `,
                [
                    context.roomId,
                    input.position,
                    context.playerId,
                    decision.optionKey,
                    decision.isCorrect,
                    decision.points,
                    decision.answeredAt,
                ],
            );

            if ((inserted.rowCount ?? 0) === 0) {
                return { kind: 'replay' };
            }

            const closeAt = new Date(
                decision.answeredAt.getTime() + ROOM_TIMING.earlyCloseBufferMs,
            );
            const presentSince = new Date(
                decision.answeredAt.getTime() - ROOM_TIMING.presenceMs,
            );

            // Досрочное закрытие + сдвиг следующих вопросов одним statement.
            // Несколько «последних» ответов приходят почти одновременно (мс), и
            // каждый видит, что ответили все. FOR UPDATE ставит их в очередь на
            // строке вопроса, а условие `"closeAt" > $3` перепроверяется уже на
            // свежей версии строки: вопрос закроет и сдвинет расписание только
            // первый, остальные увидят закрытый вопрос и ничего не тронут.
            // Без блокировки сдвиг применялся дважды (dev, 15 ноя: разбор 0,1 с).
            await client.query(
                `
                    WITH target AS (
                        SELECT q."closeAt" AS "oldCloseAt"
                        FROM "RoomQuestion" q
                        WHERE
                            q."roomId" = $1 AND q."position" = $2
                            AND q."closeAt" > $3
                            AND NOT EXISTS (
                                SELECT 1
                                FROM "RoomPlayer" p
                                WHERE
                                    p."roomId" = $1
                                    AND p."status" = 'ACTIVE'::"RoomPlayerStatus"
                                    AND p."lastSeenAt" >= $4
                                    AND NOT EXISTS (
                                        SELECT 1 FROM "RoomAnswer" a
                                        WHERE a."roomId" = $1 AND a."position" = $2
                                          AND a."playerId" = p."id"
                                    )
                            )
                        FOR UPDATE OF q
                    ),
                    closed AS (
                        UPDATE "RoomQuestion" q
                        SET "closeAt" = $3
                        FROM target
                        WHERE q."roomId" = $1 AND q."position" = $2
                        RETURNING target."oldCloseAt"
                    )
                    UPDATE "RoomQuestion" q
                    SET
                        "introAt" = q."introAt" - (closed."oldCloseAt" - $3::timestamptz),
                        "openAt" = q."openAt" - (closed."oldCloseAt" - $3::timestamptz),
                        "closeAt" = q."closeAt" - (closed."oldCloseAt" - $3::timestamptz)
                    FROM closed
                    WHERE q."roomId" = $1 AND q."position" > $2
                `,
                [context.roomId, input.position, closeAt, presentSince],
            );

            return { kind: 'inserted' };
        });
    },

    /** «Ещё раунд»: финальная комната ссылается на новую (код виден игрокам). */
    async linkNextRoom(roomId: string, hostUserId: string, nextCode: string): Promise<void> {
        await pooled('rematch.link', (client) =>
            client.query(
                `
                    UPDATE "Room"
                    SET "nextRoomCode" = $3
                    WHERE "id" = $1 AND "hostUserId" = $2 AND "status" = 'FINISHED'::"RoomStatus"
                `,
                [roomId, hostUserId, nextCode],
            ),
        );
    },
};

async function revertStart(client: Client, roomId: string): Promise<void> {
    await client.query(`DELETE FROM "RoomQuestion" WHERE "roomId" = $1`, [roomId]);
    await client.query(
        `
            UPDATE "Room"
            SET "status" = 'LOBBY'::"RoomStatus", "startedAt" = NULL
            WHERE "id" = $1 AND "status" = 'STARTING'::"RoomStatus"
        `,
        [roomId],
    );
}
