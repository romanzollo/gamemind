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
    /** URL фото профиля; null — эмблема по id. */
    image: string | null;
    points: number;
    /** Число засчитанных игр за период (волна Выживания = игра). */
    games: number;
    /**
     * Очки по режимам до дневного потолка. Сумма может быть больше `points`
     * только у игрока, упёршегося в потолок дня.
     */
    byMode: RatingPointsByMode;
};

export type RatingPointsByMode = Record<FindBestScoresMode, number>;

export type RatingPointsStanding = RatingPointsEntry & {
    /** Очки игрока на месте выше; null — игрок первый. */
    pointsAbove: number | null;
    /** Очки игрока на месте ниже; null — ниже никого. */
    pointsBelow: number | null;
    /** Сколько игроков в таблице периода. */
    totalPlayers: number;
};

/** Рекорд Блица периода: лучшие очки, при равенстве — быстрее. */
export type BlitzRecord = {
    username: string;
    score: number;
    seconds: number;
};

/** Рекорд Выживания периода: лучший забег (сумма волн с честными часами). */
export type SurvivalRecord = {
    username: string;
    score: number;
    waves: number;
};

/** Место игрока до и после одной игры (null — не в таблице). */
export type RatingGameContribution = {
    inPeriod: boolean;
    before: RatingPointsStanding | null;
    after: RatingPointsStanding | null;
};

export type RatingRecords = {
    blitz: BlitzRecord | null;
    survival: SurvivalRecord | null;
};

type SqlQuery = { text: string; values: unknown[] };

type RankedRow = {
    rank: number;
    user_id: string;
    username: string;
    image: string | null;
    points: number;
    games: number;
    classic_points: number;
    blitz_points: number;
    daily_points: number;
    survival_points: number;
};

type StandingRow = RankedRow & {
    points_above: number | null;
    points_below: number | null;
    total_players: number;
};

type BlitzRecordRow = { username: string; score: number; seconds: number };
type SurvivalRecordRow = { username: string; score: number; waves: number };

/** Режим игры по скалярам сессии — как дискриминаторы досок (Layer 1). */
const MODE_FILTER_SQL: Record<FindBestScoresMode, string> = {
    daily: 's."dailyChallengeId" IS NOT NULL',
    survival: 's."survivalRunId" IS NOT NULL',
    blitz: 's."dailyChallengeId" IS NULL AND s."timedEndsAt" IS NOT NULL',
    classic:
        's."dailyChallengeId" IS NULL AND s."timedEndsAt" IS NULL AND s."survivalRunId" IS NULL',
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
 * Условия `[from, to)` по колонке времени.
 * Колонки времени — `timestamp` без пояса, хранят UTC. Границы передаём
 * ISO-строкой с `Z` и приводим явно: иначе node-pg отдал бы Date в
 * локальном поясе процесса, а Postgres молча отбросил бы смещение.
 */
function periodWhereSql(
    column: string,
    filters: Pick<RatingPointsFilters, 'from' | 'to'>,
    values: unknown[],
): string[] {
    const where: string[] = [];

    if (filters.from) {
        values.push(filters.from.toISOString());
        where.push(
            `${column} >= ($${values.length}::timestamptz AT TIME ZONE 'UTC')`,
        );
    }

    if (filters.to) {
        values.push(filters.to.toISOString());
        where.push(
            `${column} < ($${values.length}::timestamptz AT TIME ZONE 'UTC')`,
        );
    }

    return where;
}

/** Сумма очков дня по одному режиму (до потолка — для разбивки в строке). */
function modePointsSql(mode: FindBestScoresMode): string {
    return `COALESCE(SUM(r."score") FILTER (WHERE ${MODE_FILTER_SQL[mode]}), 0)`;
}

/**
 * CTE `ranked`: все игроки периода с очками > 0 и их место.
 * `excludeSessionId` — таблица «как было до этой игры» (результат игры, 4.6e).
 */
function buildRankedCte(
    filters: RatingPointsFilters,
    values: unknown[],
    excludeSessionId?: string,
): string {
    const where = [
        ...countedGamesWhereSql(filters.mode),
        ...periodWhereSql('r."completedAt"', filters, values),
    ];

    if (excludeSessionId) {
        values.push(excludeSessionId);
        where.push(`r."sessionId" <> $${values.length}`);
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
                MAX(r."completedAt") FILTER (WHERE r."score" > 0) AS last_scored_at,
                ${modePointsSql('classic')} AS classic_points,
                ${modePointsSql('blitz')} AS blitz_points,
                ${modePointsSql('daily')} AS daily_points,
                ${modePointsSql('survival')} AS survival_points
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
                MAX(last_scored_at) AS last_scored_at,
                SUM(classic_points)::int AS classic_points,
                SUM(blitz_points)::int AS blitz_points,
                SUM(daily_points)::int AS daily_points,
                SUM(survival_points)::int AS survival_points
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
                u."image" AS image,
                pu.points,
                pu.games,
                pu.classic_points,
                pu.blitz_points,
                pu.daily_points,
                pu.survival_points
            FROM per_user AS pu
            INNER JOIN "User" AS u ON u."id" = pu.user_id
            WHERE pu.points > 0
        )`;
}

const RANKED_COLUMNS = [
    'rank',
    'user_id',
    'username',
    'image',
    'points',
    'games',
    'classic_points',
    'blitz_points',
    'daily_points',
    'survival_points',
] as const;

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
        SELECT ${RANKED_COLUMNS.join(', ')}
        FROM ranked
        ORDER BY rank
        LIMIT $${values.length}`,
        values,
    };
}

/** SQL места одного игрока + очки соседей + размер таблицы. */
export function buildRatingStandingSql(
    filters: RatingPointsFilters,
    userId: string,
    excludeSessionId?: string,
): SqlQuery {
    const values: unknown[] = [];
    const cte = buildRankedCte(filters, values, excludeSessionId);
    values.push(userId);

    return {
        text: `${cte}
        SELECT
            ${RANKED_COLUMNS.map((column) => `me.${column}`).join(', ')},
            above.points AS points_above,
            below.points AS points_below,
            (SELECT COUNT(*) FROM ranked)::int AS total_players
        FROM ranked AS me
        LEFT JOIN ranked AS above ON above.rank = me.rank - 1
        LEFT JOIN ranked AS below ON below.rank = me.rank + 1
        WHERE me.user_id = $${values.length}`,
        values,
    };
}

/** SQL: попала ли игра (её `QuizResult`) в окно периода. */
export function buildSessionInPeriodSql(
    filters: Pick<RatingPointsFilters, 'from' | 'to'>,
    sessionId: string,
): SqlQuery {
    const values: unknown[] = [sessionId];
    const where = [
        'r."sessionId" = $1',
        ...periodWhereSql('r."completedAt"', filters, values),
    ];

    return {
        text: `SELECT EXISTS (SELECT 1 FROM "QuizResult" AS r WHERE ${where.join(' AND ')}) AS in_period`,
        values,
    };
}

/**
 * SQL рекорда Блица: лучшая игра периода (без тем), при равных очках —
 * короче по времени, потом раньше. Как сортировка доски Блица (Layer 1).
 */
/**
 * Время Блица для рекорда: длительность минус засчитанные паузы на музыку
 * (`clockCreditMs`, окно прослушивания AUDIO_GUESS) — иначе аудиовопрос
 * портил бы рекорд. Без аудио `clockCreditMs` = 0 и время прежнее.
 */
const BLITZ_ACTIVE_SECONDS_SQL = `(EXTRACT(EPOCH FROM (r."completedAt" - s."startedAt")) - r."clockCreditMs" / 1000.0)`;

export function buildBlitzRecordSql(
    filters: Pick<RatingPointsFilters, 'from' | 'to'>,
): SqlQuery {
    const values: unknown[] = [];
    const where = [
        ...leaderboardModeWhereSql('blitz'),
        'r."score" > 0',
        LEADERBOARD_VISIBLE_USER_SQL,
        ...periodWhereSql('r."completedAt"', filters, values),
    ];

    return {
        text: `
        SELECT
            u."username" AS username,
            r."score" AS score,
            CEIL(${BLITZ_ACTIVE_SECONDS_SQL})::int AS seconds
        FROM "QuizResult" AS r
        INNER JOIN "QuizSession" AS s ON s."id" = r."sessionId"
        INNER JOIN "User" AS u ON u."id" = r."userId"
        WHERE ${where.join(' AND ')}
        ORDER BY r."score" DESC, ${BLITZ_ACTIVE_SECONDS_SQL} ASC, r."completedAt" ASC
        LIMIT 1`,
        values,
    };
}

/**
 * SQL рекорда Выживания: лучший забег периода по `SurvivalRun.totalScore`
 * (сумма волн с честными часами); период — по старту забега, как у доски
 * Выживания. Волны — число таких волн.
 */
export function buildSurvivalRecordSql(
    filters: Pick<RatingPointsFilters, 'from' | 'to'>,
): SqlQuery {
    const values: unknown[] = [];
    const where = [
        'sr."totalScore" > 0',
        LEADERBOARD_VISIBLE_USER_SQL,
        ...periodWhereSql('sr."startedAt"', filters, values),
    ];

    return {
        text: `
        SELECT
            u."username" AS username,
            sr."totalScore" AS score,
            (
                SELECT COUNT(*)
                FROM "QuizSession" AS s
                INNER JOIN "QuizResult" AS r ON r."sessionId" = s."id"
                WHERE s."survivalRunId" = sr."id" AND s."survivalClockOk" IS TRUE
            )::int AS waves
        FROM "SurvivalRun" AS sr
        INNER JOIN "User" AS u ON u."id" = sr."userId"
        WHERE ${where.join(' AND ')}
        ORDER BY sr."totalScore" DESC, sr."startedAt" ASC
        LIMIT 1`,
        values,
    };
}

function toEntry(row: RankedRow): RatingPointsEntry {
    return {
        rank: row.rank,
        userId: row.user_id,
        username: row.username,
        image: row.image,
        points: row.points,
        games: row.games,
        byMode: {
            classic: row.classic_points,
            blitz: row.blitz_points,
            daily: row.daily_points,
            survival: row.survival_points,
        },
    };
}

function toStanding(row: StandingRow): RatingPointsStanding {
    return {
        ...toEntry(row),
        pointsAbove: row.points_above,
        pointsBelow: row.points_below,
        totalPlayers: row.total_players,
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

        return row ? toStanding(row) : null;
    },

    /**
     * Место игрока «до» и «после» одной игры — для «+N в рейтинг» на экране
     * результата. Три чтения на одном соединении, только скаляры; вызывать
     * вне критического пути сдачи (Suspense под результатом).
     * `inPeriod = false` — игра не из этого периода (старый результат).
     */
    async findGameContribution(
        filters: RatingPointsFilters,
        userId: string,
        sessionId: string,
    ): Promise<RatingGameContribution> {
        const inPeriodQuery = buildSessionInPeriodSql(filters, sessionId);
        const afterQuery = buildRatingStandingSql(filters, userId);
        const beforeQuery = buildRatingStandingSql(filters, userId, sessionId);

        return withDirectPgClient(
            async (client) => {
                const inPeriod = await client.query<{ in_period: boolean }>(
                    inPeriodQuery.text,
                    inPeriodQuery.values,
                );

                if (!inPeriod.rows[0]?.in_period) {
                    return { inPeriod: false, before: null, after: null };
                }

                const after = await client.query<StandingRow>(
                    afterQuery.text,
                    afterQuery.values,
                );
                const before = await client.query<StandingRow>(
                    beforeQuery.text,
                    beforeQuery.values,
                );

                return {
                    inPeriod: true,
                    before: before.rows[0] ? toStanding(before.rows[0]) : null,
                    after: after.rows[0] ? toStanding(after.rows[0]) : null,
                };
            },
            { debugLabel: 'rating.game-contribution' },
        );
    },

    /** Рекорды Блица и Выживания периода — два запроса на одном соединении. */
    async findRecords(
        filters: Pick<RatingPointsFilters, 'from' | 'to'>,
    ): Promise<RatingRecords> {
        const blitzQuery = buildBlitzRecordSql(filters);
        const survivalQuery = buildSurvivalRecordSql(filters);

        return withDirectPgClient(
            async (client) => {
                const blitz = await client.query<BlitzRecordRow>(
                    blitzQuery.text,
                    blitzQuery.values,
                );
                const survival = await client.query<SurvivalRecordRow>(
                    survivalQuery.text,
                    survivalQuery.values,
                );

                return {
                    blitz: blitz.rows[0] ?? null,
                    survival: survival.rows[0] ?? null,
                };
            },
            { debugLabel: 'rating.records' },
        );
    },
};
