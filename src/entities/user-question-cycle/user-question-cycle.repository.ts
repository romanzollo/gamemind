/**
 * Persist / draw UserQuestionCycle (shuffle-bag anti-repeat).
 *
 * Зачем entity-слой:
 * - SQL отдельно от Classic/Timed runners;
 * - Daily Challenge эту таблицу не вызывает;
 * - submit / scoring / snapshot JSONB не трогаем — только start pick ids.
 *
 * Neon / Windows next dev (QUIZ_NEON_HOT_PATH):
 * - один hop через `withDirectPgQuizStartClient` (queue + 18s budget + retry),
 *   не «голый» write без timeout — иначе Connection terminated ~20s клинит очередь;
 * - upsert RETURNING вместо ensure+read (меньше round-trips на одном TLS);
 * - полный pool SELECT только если remaining < needed (reshuffle / top-up).
 *
 * Гонка двух start: optimistic UPDATE по cycleNumber + remainingIds.
 * Canon: User Question Cycle MVP.
 */

import { randomUUID } from 'node:crypto';

import type { Client } from 'pg';

import {
    withDirectPgQuizStartClient,
} from '@/lib/db/direct-pg';
import type { Difficulty } from '@/types';

import { drawFromQuestionCycle } from '@/entities/user-question-cycle/draw-from-question-cycle';

const OPTIMISTIC_DRAW_MAX_ATTEMPTS = 3;

type CycleRow = {
    remaining_ids: unknown;
    cycle_number: number;
};

export type DrawUserQuestionCycleIdsResult =
    | {
          ok: true;
          questionIds: string[];
          cycleNumber: number;
          didReshuffle: boolean;
      }
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

/** INSERT или no-op conflict → текущее состояние мешка за один round-trip. */
async function loadOrCreateCycleRow(
    client: Client,
    userId: string,
    difficulty: Difficulty,
): Promise<CycleRow> {
    const result = await client.query<CycleRow>(
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
            ON CONFLICT ("userId", "difficulty") DO UPDATE
            SET "updatedAt" = "UserQuestionCycle"."updatedAt"
            RETURNING
                "remainingIds" AS remaining_ids,
                "cycleNumber" AS cycle_number
        `,
        [randomUUID(), userId, difficulty],
    );

    const row = result.rows[0];

    if (!row) {
        throw new Error('UserQuestionCycle upsert returned no row');
    }

    return row;
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

/**
 * Узкая проверка: какие id из remaining ещё active+PUBLISHED.
 * Дешевле полного pool, когда хвоста уже хватает на N.
 */
async function filterIdsStillInPool(
    client: Client,
    difficulty: Difficulty,
    candidateIds: string[],
): Promise<string[]> {
    if (candidateIds.length === 0) {
        return [];
    }

    const result = await client.query<{ id: string }>(
        `
            SELECT q."id"
            FROM "Question" q
            WHERE
                q."id" = ANY($1::text[])
                AND q."difficulty" = $2::"Difficulty"
                AND q."isActive" = true
                AND q."publicationStatus" = 'PUBLISHED'::"QuestionPublicationStatus"
        `,
        [candidateIds, difficulty],
    );

    const alive = new Set(result.rows.map((row) => row.id));

    return candidateIds.filter((id) => alive.has(id));
}

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
    for (let attempt = 1; attempt <= OPTIMISTIC_DRAW_MAX_ATTEMPTS; attempt += 1) {
        const row = await loadOrCreateCycleRow(client, userId, difficulty);
        const remainingIds = parseRemainingIds(row.remaining_ids);
        const cycleNumber = Number(row.cycle_number);

        let poolIds: string[];

        if (remainingIds.length >= needed) {
            // Хвоста хватает: не тянем весь банк — только проверка «ещё в pool».
            poolIds = await filterIdsStillInPool(
                client,
                difficulty,
                remainingIds,
            );

            if (poolIds.length < needed) {
                // После filter хвост короткий → нужен полный pool для reshuffle.
                poolIds = await loadActivePublishedPoolIds(client, difficulty);
            }
        } else {
            poolIds = await loadActivePublishedPoolIds(client, difficulty);
        }

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
        return withDirectPgQuizStartClient(
            (client) =>
                drawQuestionIdsWithClient(
                    client,
                    input.userId,
                    input.difficulty,
                    input.needed,
                ),
            2,
        );
    },
};
