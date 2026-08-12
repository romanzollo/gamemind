/**
 * Persist / draw UserQuestionCycle (shuffle-bag anti-repeat).
 *
 * Зачем entity-слой:
 * - SQL и optimistic UPDATE отдельно от Classic/Timed runners;
 * - Daily Challenge эту таблицу не вызывает;
 * - submit / scoring / snapshot JSONB не трогаем — только start pick ids.
 *
 * Гонка двух параллельных start: UPDATE … WHERE remainingIds + cycleNumber
 * совпадают с прочитанными (optimistic). Конфликт → короткий retry на том же
 * Direct client (без BEGIN/COMMIT на hot path).
 *
 * Один withDirectPgWriteClient на весь draw: ensure row + pool + read + update.
 * Не Promise.all двух Direct TLS.
 *
 * Canon: QUIZ_NEON_HOT_PATH + User Question Cycle MVP.
 */

import { randomUUID } from 'node:crypto';

import type { Client } from 'pg';

import { withDirectPgWriteClient } from '@/lib/db/direct-pg';
import type { Difficulty } from '@/types';

import { drawFromQuestionCycle } from '@/entities/user-question-cycle/draw-from-question-cycle';

const OPTIMISTIC_DRAW_MAX_ATTEMPTS = 5;

type CycleRow = {
    remaining_ids: unknown;
    cycle_number: number;
};

export type DrawUserQuestionCycleIdsResult =
    | { ok: true; questionIds: string[]; cycleNumber: number; didReshuffle: boolean }
    | { ok: false; reason: 'NOT_ENOUGH_QUESTIONS' };

function parseRemainingIds(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    if (!value.every((item) => typeof item === 'string')) {
        return [];
    }

    return value;
}

async function ensureCycleRow(
    client: Client,
    userId: string,
    difficulty: Difficulty,
): Promise<void> {
    // cycleNumber 0 + пустой remaining: первый draw откроет cycle 1 через reshuffle.
    await client.query(
        `
            INSERT INTO "UserQuestionCycle" (
                "id",
                "userId",
                "difficulty",
                "remainingIds",
                "cycleNumber",
                "createdAt",
                "updatedAt"
            )
            VALUES (
                $1,
                $2,
                $3::"Difficulty",
                '[]'::jsonb,
                0,
                NOW(),
                NOW()
            )
            ON CONFLICT ("userId", "difficulty") DO NOTHING
        `,
        [randomUUID(), userId, difficulty],
    );
}

async function loadActivePublishedPoolIds(
    client: Client,
    difficulty: Difficulty,
): Promise<string[]> {
    const result = await client.query<{ id: string }>(
        `
            SELECT q."id"
            FROM "Question" q
            WHERE
                q."difficulty" = $1::"Difficulty"
                AND q."isActive" = true
                AND q."publicationStatus" = 'PUBLISHED'::"QuestionPublicationStatus"
        `,
        [difficulty],
    );

    return result.rows.map((row) => row.id);
}

async function readCycleRow(
    client: Client,
    userId: string,
    difficulty: Difficulty,
): Promise<CycleRow> {
    const result = await client.query<CycleRow>(
        `
            SELECT
                "remainingIds" AS remaining_ids,
                "cycleNumber" AS cycle_number
            FROM "UserQuestionCycle"
            WHERE
                "userId" = $1
                AND "difficulty" = $2::"Difficulty"
        `,
        [userId, difficulty],
    );

    const row = result.rows[0];

    if (!row) {
        throw new Error('UserQuestionCycle row missing after ensure');
    }

    return row;
}

/**
 * Optimistic persist: пишет только если мешок не изменился с момента read.
 * Возвращает true, если строка обновлена.
 */
async function tryPersistDraw(
    client: Client,
    input: {
        userId: string;
        difficulty: Difficulty;
        expectedRemainingIds: string[];
        expectedCycleNumber: number;
        nextRemainingIds: string[];
        nextCycleNumber: number;
    },
): Promise<boolean> {
    const result = await client.query(
        `
            UPDATE "UserQuestionCycle"
            SET
                "remainingIds" = $4::jsonb,
                "cycleNumber" = $5,
                "updatedAt" = NOW()
            WHERE
                "userId" = $1
                AND "difficulty" = $2::"Difficulty"
                AND "cycleNumber" = $3
                AND "remainingIds" = $6::jsonb
        `,
        [
            input.userId,
            input.difficulty,
            input.expectedCycleNumber,
            JSON.stringify(input.nextRemainingIds),
            input.nextCycleNumber,
            JSON.stringify(input.expectedRemainingIds),
        ],
    );

    return (result.rowCount ?? 0) > 0;
}

async function drawQuestionIdsWithClient(
    client: Client,
    userId: string,
    difficulty: Difficulty,
    needed: number,
): Promise<DrawUserQuestionCycleIdsResult> {
    await ensureCycleRow(client, userId, difficulty);

    const poolIds = await loadActivePublishedPoolIds(client, difficulty);

    for (let attempt = 1; attempt <= OPTIMISTIC_DRAW_MAX_ATTEMPTS; attempt += 1) {
        const row = await readCycleRow(client, userId, difficulty);
        const remainingIds = parseRemainingIds(row.remaining_ids);
        const cycleNumber = Number(row.cycle_number);

        const drawn = drawFromQuestionCycle({
            remainingIds,
            cycleNumber,
            poolIds,
            needed,
        });

        if (!drawn.ok) {
            return { ok: false, reason: drawn.reason };
        }

        const persisted = await tryPersistDraw(client, {
            userId,
            difficulty,
            expectedRemainingIds: remainingIds,
            expectedCycleNumber: cycleNumber,
            nextRemainingIds: drawn.nextRemainingIds,
            nextCycleNumber: drawn.nextCycleNumber,
        });

        if (persisted) {
            return {
                ok: true,
                questionIds: drawn.drawnIds,
                cycleNumber: drawn.nextCycleNumber,
                didReshuffle: drawn.didReshuffle,
            };
        }
    }

    throw new Error(
        `UserQuestionCycle optimistic draw failed after ${OPTIMISTIC_DRAW_MAX_ATTEMPTS} attempts`,
    );
}

export const userQuestionCycleRepository = {
    /**
     * Забирает N question id из мешка пользователя и сохраняет хвост.
     * Только Classic/Timed start. Не вызывать с submit/result.
     */
    async drawQuestionIds(input: {
        userId: string;
        difficulty: Difficulty;
        needed: number;
    }): Promise<DrawUserQuestionCycleIdsResult> {
        return withDirectPgWriteClient((client) =>
            drawQuestionIdsWithClient(
                client,
                input.userId,
                input.difficulty,
                input.needed,
            ),
        );
    },
};
