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

/**
 * DATE из Postgres → `YYYY-MM-DD`.
 * node-pg на Windows часто отдаёт DATE как Date на *локальной* полуночи
 * (не UTC) — getUTC* тогда сдвигает день назад. Различаем оба варианта.
 */
function toDateKey(value: Date | string): string {
    if (typeof value === 'string') {
        return value.slice(0, 10);
    }

    const isUtcMidnight =
        value.getUTCHours() === 0 &&
        value.getUTCMinutes() === 0 &&
        value.getUTCSeconds() === 0 &&
        value.getUTCMilliseconds() === 0;

    if (isUtcMidnight) {
        return value.toISOString().slice(0, 10);
    }

    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');

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

type DailyAttemptRow = {
    session_id: string;
    status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
    score: number | null;
    total_questions: number | null;
    correct_count: number | null;
};

export type DailyChallengeAttempt =
    | {
          kind: 'in_progress';
          sessionId: string;
      }
    | {
          kind: 'completed';
          sessionId: string;
          score: number;
          totalQuestions: number;
          correctCount: number;
      }
    | {
          kind: 'other';
          sessionId: string;
          status: 'ABANDONED';
      };

/**
 * Одна попытка пользователя на челлендж (UNIQUE userId+dailyChallengeId).
 * Нужна для resume / redirect на result / блокировки второго старта.
 */
async function findAttemptByUserAndChallenge(
    userId: string,
    dailyChallengeId: string,
): Promise<DailyChallengeAttempt | null> {
    const result = await withDirectPgClient((client) =>
        client.query<DailyAttemptRow>(
            `
                SELECT
                    s."id" AS session_id,
                    s."status"::text AS status,
                    r."score" AS score,
                    r."totalQuestions" AS total_questions,
                    r."correctCount" AS correct_count
                FROM "QuizSession" s
                LEFT JOIN "QuizResult" r
                    ON r."sessionId" = s."id"
                WHERE s."userId" = $1
                  AND s."dailyChallengeId" = $2
                LIMIT 1
            `,
            [userId, dailyChallengeId],
        ),
    );

    const row = result.rows[0];

    if (!row) {
        return null;
    }

    if (row.status === 'COMPLETED') {
        return {
            kind: 'completed',
            sessionId: row.session_id,
            score: row.score ?? 0,
            totalQuestions: row.total_questions ?? 0,
            correctCount: row.correct_count ?? 0,
        };
    }

    if (row.status === 'IN_PROGRESS') {
        return {
            kind: 'in_progress',
            sessionId: row.session_id,
        };
    }

    return {
        kind: 'other',
        sessionId: row.session_id,
        status: 'ABANDONED',
    };
}

type DailyScoreRow = {
    user_id: string;
    username: string;
    score: number;
    total_questions: number;
    correct_count: number;
    completed_at: Date;
};

/**
 * Рейтинг одного дня: одна попытка на user → без DISTINCT ON.
 * Только завершённые сессии с этим dailyChallengeId.
 */
async function findScoresByChallengeId(
    dailyChallengeId: string,
    limit: number,
) {
    const result = await withDirectPgClient((client) =>
        client.query<DailyScoreRow>(
            `
                SELECT
                    u."id" AS user_id,
                    u."username" AS username,
                    r."score" AS score,
                    r."totalQuestions" AS total_questions,
                    r."correctCount" AS correct_count,
                    r."completedAt" AS completed_at
                FROM "QuizResult" AS r
                INNER JOIN "QuizSession" AS s
                    ON s."id" = r."sessionId"
                INNER JOIN "User" AS u
                    ON u."id" = r."userId"
                WHERE s."dailyChallengeId" = $1
                ORDER BY
                    r."score" DESC,
                    r."completedAt" ASC
                LIMIT $2
            `,
            [dailyChallengeId, limit],
        ),
    );

    return result.rows.map((row) => ({
        userId: row.user_id,
        score: row.score,
        totalQuestions: row.total_questions,
        correctCount: row.correct_count,
        completedAt: row.completed_at,
        user: {
            id: row.user_id,
            username: row.username,
        },
    }));
}

export const dailyChallengeRepository = {
    findByChallengeDate,
    findPublishedQuestionIdsByDifficulty,
    createOrGetExisting,
    findAttemptByUserAndChallenge,
    findScoresByChallengeId,
};
