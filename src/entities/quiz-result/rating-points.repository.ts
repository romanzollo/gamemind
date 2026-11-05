/**
 * «Очки за период» — главный рейтинг (DECISIONS → Weekly rating points).
 *
 * Очки игрока = сумма `QuizResult.score` засчитанных игр периода, причём
 * за каждый московский день берётся не больше `dailyCap`
 * (`SUM(LEAST(очки_дня, cap))`). Засчитанные игры:
 * - есть `QuizResult` (сдана; поздний Блиц результата не имеет);
 * - не игра по теме (`topicTagId IS NULL`, ADR Play topics);
 * - Выживание — только волны с `survivalClockOk = true`;
 * - игрок видим в рейтингах (`LEADERBOARD_VISIBLE_USER_SQL`).
 * Ничья: выше тот, чья последняя игра с очками раньше; дальше — по id,
 * чтобы порядок был стабильным.
 *
 * Только чтение готовых строк: горячий путь квиза (старт, сдача, часы) не
 * трогаем и ничего не пишем на сдаче. Никогда не читаем
 * `snapshotData` / `reviewPayload`. Считаем «на лету» — на проде (5 ноя)
 * запрос занимает доли миллисекунды; индекс `QuizResult(completedAt)` —
 * когда результатов станет больше ~50k или запрос превысит 50 мс.
 *
 * Границы периода и потолок приходят из feature (`rating-week.ts`):
 * entity не знает слов «неделя» и «МСК-понедельник».
 */

import { withDirectPgClient } from '@/lib/db/direct-pg';
import {
    leaderboardModeWhereSql,
    type FindBestScoresMode,
} from '@/entities/quiz-result/quiz-result.repository';
import { LEADERBOARD_VISIBLE_USER_SQL } from '@/entities/user/leaderboard-visibility';

/** Режим таблицы очков: все режимы вместе или один. */
export type RatingPointsMode = 'all' | FindBestScoresMode;

export type RatingPointsFilters = {
    /** Нижняя граница `completedAt` включительно; null — без границы. */
    from: Date | null;
    /** Верхняя граница `completedAt` не включительно; null — без границы. */
    to: Date | null;
    mode: RatingPointsMode;
    /** Максимум очков рейтинга за один московский день. */
    dailyCap: number;
};

export type RatingPointsEntry = {
    rank: number;
    userId: string;
    username: string;
    points: number;
    /** Число засчитанных игр за период (волна Выживания = игра). */
    games: number;
};

export type RatingPointsStanding = RatingPointsEntry & {
    /** Очки игрока на месте выше; null — игрок первый. */
    pointsAbove: number | null;
    /** Сколько игроков в таблице периода. */
    totalPlayers: number;
};

type SqlQuery = { text: string; values: unknown[] };

type RankedRow = {
    rank: number;
    user_id: string;
    username: string;
    points: number;
    games: number;
};

type StandingRow = RankedRow & {
    points_above: number | null;
    total_players: number;
};

/** WHERE засчитанных игр для режима (скаляры сессии, без JSONB). */
function countedGamesWhereSql(mode: RatingPointsMode): string[] {
    const modeWhere =
        mode === 'all'
            ? ['(s."survivalRunId" IS NULL OR s."survivalClockOk" IS TRUE)']
            : leaderboardModeWhereSql(mode);

    return [...modeWhere, 's."topicTagId" IS NULL', LEADERBOARD_VISIBLE_USER_SQL];
}

/**
 * CTE `ranked`: все игроки периода с очками > 0 и их место.
 * Колонка `completedAt` — `timestamp` без пояса, хранит UTC. Границы
 * передаём ISO-строкой с `Z` и приводим явно: иначе node-pg отдал бы Date
 * в локальном поясе процесса, а Postgres молча отбросил бы смещение.
 */
function buildRankedCte(
    filters: RatingPointsFilters,
    values: unknown[],
): string {
    const where = countedGamesWhereSql(filters.mode);

    if (filters.from) {
        values.push(filters.from.toISOString());
        where.push(
            `r."completedAt" >= ($${values.length}::timestamptz AT TIME ZONE 'UTC')`,
        );
    }

    if (filters.to) {
        values.push(filters.to.toISOString());
        where.push(
            `r."completedAt" < ($${values.length}::timestamptz AT TIME ZONE 'UTC')`,
        );
    }

    values.push(filters.dailyCap);
    const capParam = `$${values.length}`;

    return `
        WITH per_day AS (
            SELECT
                r."userId" AS user_id,
                (r."completedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Moscow')::date AS day,
                SUM(r."score") AS day_points,
                COUNT(*) AS games,
                MAX(r."completedAt") FILTER (WHERE r."score" > 0) AS last_scored_at
            FROM "QuizResult" AS r
            INNER JOIN "QuizSession" AS s ON s."id" = r."sessionId"
            INNER JOIN "User" AS u ON u."id" = r."userId"
            WHERE ${where.join(' AND ')}
            GROUP BY 1, 2
        ),
        per_user AS (
            SELECT
                user_id,
                SUM(LEAST(day_points, ${capParam}::int))::int AS points,
                SUM(games)::int AS games,
                MAX(last_scored_at) AS last_scored_at
            FROM per_day
            GROUP BY user_id
        ),
        ranked AS (
            SELECT
                (ROW_NUMBER() OVER (
                    ORDER BY pu.points DESC, pu.last_scored_at ASC, pu.user_id ASC
                ))::int AS rank,
                pu.user_id,
                u."username" AS username,
                pu.points,
                pu.games
            FROM per_user AS pu
            INNER JOIN "User" AS u ON u."id" = pu.user_id
            WHERE pu.points > 0
        )`;
}

/** SQL таблицы периода: первые `limit` мест. */
export function buildRatingBoardSql(
    filters: RatingPointsFilters,
    limit: number,
): SqlQuery {
    const values: unknown[] = [];
    const cte = buildRankedCte(filters, values);
    values.push(limit);

    return {
        text: `${cte}
        SELECT rank, user_id, username, points, games
        FROM ranked
        ORDER BY rank
        LIMIT $${values.length}`,
        values,
    };
}

/** SQL места одного игрока + очки соседа выше + размер таблицы. */
export function buildRatingStandingSql(
    filters: RatingPointsFilters,
    userId: string,
): SqlQuery {
    const values: unknown[] = [];
    const cte = buildRankedCte(filters, values);
    values.push(userId);

    return {
        text: `${cte}
        SELECT
            me.rank, me.user_id, me.username, me.points, me.games,
            above.points AS points_above,
            (SELECT COUNT(*) FROM ranked)::int AS total_players
        FROM ranked AS me
        LEFT JOIN ranked AS above ON above.rank = me.rank - 1
        WHERE me.user_id = $${values.length}`,
        values,
    };
}

function toEntry(row: RankedRow): RatingPointsEntry {
    return {
        rank: row.rank,
        userId: row.user_id,
        username: row.username,
        points: row.points,
        games: row.games,
    };
}

export const ratingPointsRepository = {
    /** Таблица периода: места 1…limit. */
    async findBoard(
        filters: RatingPointsFilters,
        limit: number,
    ): Promise<RatingPointsEntry[]> {
        const query = buildRatingBoardSql(filters, limit);
        const result = await withDirectPgClient(
            (client) => client.query<RankedRow>(query.text, query.values),
            { debugLabel: 'rating.points-board' },
        );

        return result.rows.map(toEntry);
    },

    /**
     * Место игрока в периоде. null — у игрока нет очков в периоде или он
     * скрыт из рейтингов (гость, тест-аккаунт, неактивный).
     */
    async findStanding(
        filters: RatingPointsFilters,
        userId: string,
    ): Promise<RatingPointsStanding | null> {
        const query = buildRatingStandingSql(filters, userId);
        const result = await withDirectPgClient(
            (client) => client.query<StandingRow>(query.text, query.values),
            { debugLabel: 'rating.points-standing' },
        );
        const row = result.rows[0];

        if (!row) {
            return null;
        }

        return {
            ...toEntry(row),
            pointsAbove: row.points_above,
            totalPlayers: row.total_players,
        };
    },
};
