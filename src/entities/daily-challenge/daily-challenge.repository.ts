/**
 * Persist / read DailyChallenge rows (lazy day freeze).
 *
 * Зачем entity-слой:
 * - SQL и Neon-контракт (unpooled direct pg) отдельно от UI / Server Actions;
 * - classic quiz pick (`ORDER BY RANDOM`) сюда не тащим — только id pool + upsert дня;
 * - scoring / snapshot write не меняем.
 *
 * Гонка двух первых игроков: INSERT … ON CONFLICT DO NOTHING → SELECT.
 * Источник правды после успеха — строка в БД, не повторный pick в памяти.
 *
 * Canon: DECISIONS.md → Daily Challenge MVP.
 */

import { randomUUID } from 'node:crypto';

import {
    withDirectPgClient,
    withDirectPgWriteClient,
} from '@/lib/db/direct-pg';
import type { Difficulty } from '@/types';
import type { DailyChallengeDefinition } from '@/features/daily-challenge/types';

type DailyChallengeRow = {
    id: string;
    challenge_date: Date;
    difficulty: Difficulty;
    question_count: number;
    question_ids: unknown;
};

function toDateKey(value: Date | string): string {
    if (typeof value === 'string') {
        // pg иногда отдаёт DATE как 'YYYY-MM-DD'
        return value.slice(0, 10);
    }

    // node-pg Date для DATE = UTC midnight календарного дня
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

function parseQuestionIds(value: unknown): string[] | null {
    if (!Array.isArray(value)) {
        return null;
    }

    if (!value.every((item) => typeof item === 'string')) {
        return null;
    }

    return value;
}

function mapRow(row: DailyChallengeRow): DailyChallengeDefinition | null {
    const questionIds = parseQuestionIds(row.question_ids);

    if (!questionIds) {
        return null;
    }

    return {
        id: row.id,
        challengeDate: toDateKey(row.challenge_date),
        difficulty: row.difficulty,
        questionCount: row.question_count,
        questionIds,
    };
}

async function findByChallengeDate(
    challengeDate: string,
): Promise<DailyChallengeDefinition | null> {
    const result = await withDirectPgClient((client) =>
        client.query<DailyChallengeRow>(
            `
                SELECT
                    "id",
                    "challengeDate" AS challenge_date,
                    "difficulty",
                    "questionCount" AS question_count,
                    "questionIds" AS question_ids
                FROM "DailyChallenge"
                WHERE "challengeDate" = $1::date
                LIMIT 1
            `,
            [challengeDate],
        ),
    );

    const row = result.rows[0];

    if (!row) {
        return null;
    }

    return mapRow(row);
}

/**
 * Id опубликованных активных вопросов нужной сложности (pool для freeze).
 * Без RANDOM — порядок не важен; pick стабилизирует сортировкой в JS.
 */
async function findPublishedQuestionIdsByDifficulty(
    difficulty: Difficulty,
): Promise<string[]> {
    const result = await withDirectPgClient((client) =>
        client.query<{ id: string }>(
            `
                SELECT q."id"
                FROM "Question" q
                WHERE q."difficulty" = $1::"Difficulty"
                  AND q."isActive" = true
                  AND q."publicationStatus" = 'PUBLISHED'::"QuestionPublicationStatus"
            `,
            [difficulty],
        ),
    );

    return result.rows.map((row) => row.id);
}

type CreateDailyChallengeInput = {
    challengeDate: string;
    difficulty: Difficulty;
    questionCount: number;
    questionIds: string[];
};

type CreateOrGetExistingResult = {
    challenge: DailyChallengeDefinition;
    /** true, если этот INSERT реально вставил строку (rowCount = 1). */
    created: boolean;
};

/**
 * Вставляет день или возвращает уже созданный (race-safe).
 * Caller обязан передать валидный freeze (длина = questionCount).
 */
async function createOrGetExisting(
    input: CreateDailyChallengeInput,
): Promise<CreateOrGetExistingResult> {
    const id = randomUUID();

    const insertResult = await withDirectPgWriteClient((client) =>
        client.query(
            `
                INSERT INTO "DailyChallenge" (
                    "id",
                    "challengeDate",
                    "difficulty",
                    "questionCount",
                    "questionIds"
                )
                VALUES (
                    $1,
                    $2::date,
                    $3::"Difficulty",
                    $4,
                    $5::jsonb
                )
                ON CONFLICT ("challengeDate") DO NOTHING
            `,
            [
                id,
                input.challengeDate,
                input.difficulty,
                input.questionCount,
                JSON.stringify(input.questionIds),
            ],
        ),
    );

    const existing = await findByChallengeDate(input.challengeDate);

    if (!existing) {
        throw new Error(
            `DailyChallenge row missing after upsert for ${input.challengeDate}`,
        );
    }

    return {
        challenge: existing,
        created: insertResult.rowCount === 1,
    };
}

export const dailyChallengeRepository = {
    findByChallengeDate,
    findPublishedQuestionIdsByDifficulty,
    createOrGetExisting,
};
