/**
 * Отчёт воронки для админки (`/:locale/admin/funnel`, ROADMAP 3.5c).
 *
 * Только чтение, только админ. Путь до игры — из `AnalyticsEvent`
 * (маячок), путь от старта — из таблиц игры (QuizSession / QuizAnswer /
 * FriendChallenge): туда ничего лишнего не пишется, отчёт считает при чтении.
 *
 * Кого не считаем: `User.isTestAccount` (прод-smoke) и роль ADMIN (владелец).
 * Визит, в котором хоть одно событие от такого игрока, выпадает целиком.
 *
 * Время: колонки — TIMESTAMP без пояса с UTC внутри, поэтому граница
 * периода считается в SQL от `now() AT TIME ZONE 'UTC'`, а дни для
 * возвратов — по Москве (основной рынок, как серия Челленджа).
 *
 * Pooled-клиент вне Direct-очереди: отчёт не должен вставать в очередь
 * квиза на dev и не трогает горячий путь на проде.
 *
 * Canon: docs/DECISIONS.md → Funnel analytics: own events + existing tables.
 */

import { withPooledPgReadClient } from '@/lib/db/direct-pg';

export const FUNNEL_PERIOD_DAYS = [7, 14, 30] as const;
export type FunnelPeriodDays = (typeof FUNNEL_PERIOD_DAYS)[number];

export type FunnelGameMode = 'classic' | 'blitz' | 'survival' | 'daily' | 'challenge';

/** Путь посетителя внутри одного визита (вкладки). */
export type FunnelVisitSegment = {
    visits: number;
    demoAnswered: number;
    modeOpened: number;
    authPageViewed: number;
    gameStarted: number;
    gameCompleted: number;
    shared: number;
};

export type FunnelSourceRow = {
    /** `ref` / `utm_source`, иначе хост источника, иначе `direct`. */
    source: string;
    visits: number;
    gameStarted: number;
};

export type FunnelGamesRow = {
    started: number;
    answered: number;
    completed: number;
};

export type FunnelReport = {
    periodDays: FunnelPeriodDays;
    /** Визиты: пришёл без входа (новичок) / уже был в аккаунте или гостем. */
    visitsAnonymous: FunnelVisitSegment;
    visitsSignedIn: FunnelVisitSegment;
    sources: FunnelSourceRow[];
    /** Партии по режиму (Выживание — забег, а не волна). */
    gamesByMode: Record<FunnelGameMode, FunnelGamesRow>;
    gamesTotal: FunnelGamesRow;
    players: { total: number; guests: number; accounts: number };
    /** Доиграли партию → начали новую в течение 10 минут. */
    replay: { completers: number; replayed: number };
    challenges: { created: number; accepted: number };
    signups: {
        total: number;
        fromGuest: number;
        byMethod: { password: number; yandex: number; vk: number };
        guestMerged: number;
    };
    /** Новые игроки периода: вернулись на следующий день / в течение недели. */
    retention: {
        newPlayers: number;
        d1Eligible: number;
        d1Returned: number;
        w1Eligible: number;
        w1Returned: number;
    };
};

const REAL_USER = `u."isTestAccount" = false AND u."role"::text <> 'ADMIN'`;
const PERIOD_START = `((now() AT TIME ZONE 'UTC') - make_interval(days => $1))`;
const MOSCOW_DAY = (column: string) =>
    `((${column} AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Moscow')::date`;
/** Партия = старт режима; волны Выживания после первой — продолжение забега. */
const GAME_START = `(qs."survivalWaveIndex" IS NULL OR qs."survivalWaveIndex" = 1)`;
const MODE_CASE = `
    CASE
        WHEN qs."friendChallengeId" IS NOT NULL THEN 'challenge'
        WHEN qs."dailyChallengeId" IS NOT NULL THEN 'daily'
        WHEN qs."survivalRunId" IS NOT NULL THEN 'survival'
        WHEN qs."timedEndsAt" IS NOT NULL THEN 'blitz'
        ELSE 'classic'
    END`;
/** Сколько после начала визита ещё считаем старт игры «из этого визита». */
const VISIT_GAME_WINDOW = `interval '3 hours'`;
const REPLAY_WINDOW = `interval '10 minutes'`;

const VISITS_SQL = `
    WITH ev AS (
        SELECT e.* FROM "AnalyticsEvent" e
        WHERE e."createdAt" >= ${PERIOD_START} AND e."visitId" <> 'server'
    ),
    excluded AS (
        SELECT DISTINCT ev."visitId" FROM ev
        JOIN "User" u ON u."id" = ev."userId"
        WHERE NOT (${REAL_USER})
    ),
    v AS (
        SELECT
            ev."visitId",
            min(ev."createdAt") AS started_at,
            (array_agg(ev."userId" ORDER BY ev."id"))[1] IS NULL AS anonymous,
            (array_agg(ev."props" ORDER BY ev."id"))[1] AS entry,
            bool_or(ev."name" = 'demo_answer') AS demo,
            bool_or(ev."name" = 'mode_open') AS sheet,
            bool_or(ev."name" = 'share_click') AS shared,
            bool_or(ev."name" = 'page_view'
                AND ev."props"->>'route' IN ('/login', '/register')) AS auth_page,
            array_agg(DISTINCT ev."userId")
                FILTER (WHERE ev."userId" IS NOT NULL) AS users
        FROM ev
        WHERE ev."visitId" NOT IN (SELECT "visitId" FROM excluded)
        GROUP BY ev."visitId"
        HAVING bool_or(ev."name" = 'visit')
    ),
    vg AS (
        SELECT v.*,
            EXISTS (
                SELECT 1 FROM "QuizSession" qs
                WHERE qs."userId" = ANY (v.users)
                  AND qs."startedAt" BETWEEN v.started_at
                      AND v.started_at + ${VISIT_GAME_WINDOW}
            ) AS started,
            EXISTS (
                SELECT 1 FROM "QuizSession" qs
                WHERE qs."userId" = ANY (v.users)
                  AND qs."status" = 'COMPLETED'
                  AND qs."startedAt" BETWEEN v.started_at
                      AND v.started_at + ${VISIT_GAME_WINDOW}
            ) AS completed
        FROM v
    )
    SELECT
        anonymous,
        count(*)::int AS visits,
        count(*) FILTER (WHERE demo)::int AS demo,
        count(*) FILTER (WHERE sheet)::int AS sheet,
        count(*) FILTER (WHERE auth_page)::int AS auth_page,
        count(*) FILTER (WHERE started)::int AS started,
        count(*) FILTER (WHERE completed)::int AS completed,
        count(*) FILTER (WHERE shared)::int AS shared
    FROM vg
    GROUP BY anonymous`;

const SOURCES_SQL = `
    WITH ev AS (
        SELECT e.* FROM "AnalyticsEvent" e
        WHERE e."createdAt" >= ${PERIOD_START} AND e."visitId" <> 'server'
    ),
    excluded AS (
        SELECT DISTINCT ev."visitId" FROM ev
        JOIN "User" u ON u."id" = ev."userId"
        WHERE NOT (${REAL_USER})
    ),
    v AS (
        SELECT
            ev."visitId",
            min(ev."createdAt") AS started_at,
            coalesce(
                (array_agg(ev."props"->>'ref') FILTER (WHERE ev."name" = 'visit'))[1],
                (array_agg(ev."props"->>'referrerHost') FILTER (WHERE ev."name" = 'visit'))[1],
                'direct'
            ) AS source,
            array_agg(DISTINCT ev."userId")
                FILTER (WHERE ev."userId" IS NOT NULL) AS users
        FROM ev
        WHERE ev."visitId" NOT IN (SELECT "visitId" FROM excluded)
        GROUP BY ev."visitId"
        HAVING bool_or(ev."name" = 'visit')
    )
    SELECT
        source,
        count(*)::int AS visits,
        count(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM "QuizSession" qs
            WHERE qs."userId" = ANY (v.users)
              AND qs."startedAt" BETWEEN v.started_at
                  AND v.started_at + ${VISIT_GAME_WINDOW}
        ))::int AS started
    FROM v
    GROUP BY source
    ORDER BY visits DESC, source
    LIMIT 12`;

const GAMES_SQL = `
    SELECT
        ${MODE_CASE} AS mode,
        u."isGuest" AS is_guest,
        count(*)::int AS started,
        count(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM "QuizAnswer" a WHERE a."sessionId" = qs."id"
        ))::int AS answered,
        count(*) FILTER (WHERE qs."status" = 'COMPLETED')::int AS completed,
        count(DISTINCT qs."userId")::int AS players
    FROM "QuizSession" qs
    JOIN "User" u ON u."id" = qs."userId"
    WHERE qs."startedAt" >= ${PERIOD_START} AND ${REAL_USER} AND ${GAME_START}
    GROUP BY GROUPING SETS ((1), (2), ())`;

const REPLAY_SQL = `
    SELECT
        count(DISTINCT qs."userId")::int AS completers,
        count(DISTINCT qs."userId") FILTER (WHERE EXISTS (
            SELECT 1 FROM "QuizSession" nx
            WHERE nx."userId" = qs."userId"
              AND nx."startedAt" > qs."completedAt"
              AND nx."startedAt" <= qs."completedAt" + ${REPLAY_WINDOW}
              AND (nx."survivalWaveIndex" IS NULL OR nx."survivalWaveIndex" = 1)
        ))::int AS replayed
    FROM "QuizSession" qs
    JOIN "User" u ON u."id" = qs."userId"
    WHERE qs."startedAt" >= ${PERIOD_START} AND ${REAL_USER} AND ${GAME_START}
      AND qs."status" = 'COMPLETED'`;

const CHALLENGES_SQL = `
    SELECT
        (SELECT count(*)::int FROM "FriendChallenge" fc
         JOIN "User" u ON u."id" = fc."creatorUserId"
         WHERE fc."createdAt" >= ${PERIOD_START} AND ${REAL_USER}) AS created,
        (SELECT count(*)::int FROM "QuizSession" qs
         JOIN "User" u ON u."id" = qs."userId"
         JOIN "FriendChallenge" fc ON fc."id" = qs."friendChallengeId"
         WHERE qs."startedAt" >= ${PERIOD_START} AND ${REAL_USER}
           AND qs."userId" IS DISTINCT FROM fc."creatorUserId") AS accepted`;

const SIGNUPS_SQL = `
    SELECT e."name", e."props"->>'method' AS method,
           (e."props"->>'wasGuest')::boolean AS was_guest, count(*)::int AS n
    FROM "AnalyticsEvent" e
    JOIN "User" u ON u."id" = e."userId"
    WHERE e."createdAt" >= ${PERIOD_START} AND e."visitId" = 'server' AND ${REAL_USER}
    GROUP BY 1, 2, 3`;

const RETENTION_SQL = `
    WITH days AS (
        SELECT DISTINCT qs."userId", ${MOSCOW_DAY('qs."startedAt"')} AS d
        FROM "QuizSession" qs
        JOIN "User" u ON u."id" = qs."userId"
        WHERE ${REAL_USER}
    ),
    first AS (SELECT "userId", min(d) AS d0 FROM days GROUP BY "userId"),
    today AS (SELECT ((now() AT TIME ZONE 'Europe/Moscow'))::date AS t)
    SELECT
        count(*)::int AS new_players,
        count(*) FILTER (WHERE f.d0 <= t.t - 1)::int AS d1_eligible,
        count(*) FILTER (WHERE f.d0 <= t.t - 1 AND EXISTS (
            SELECT 1 FROM days x WHERE x."userId" = f."userId" AND x.d = f.d0 + 1
        ))::int AS d1_returned,
        count(*) FILTER (WHERE f.d0 <= t.t - 7)::int AS w1_eligible,
        count(*) FILTER (WHERE f.d0 <= t.t - 7 AND EXISTS (
            SELECT 1 FROM days x WHERE x."userId" = f."userId"
              AND x.d BETWEEN f.d0 + 1 AND f.d0 + 7
        ))::int AS w1_returned
    FROM first f, today t
    WHERE f.d0 > t.t - $1::int`;

type VisitRow = {
    anonymous: boolean;
    visits: number;
    demo: number;
    sheet: number;
    auth_page: number;
    started: number;
    completed: number;
    shared: number;
};

type GamesRow = {
    mode: FunnelGameMode | null;
    is_guest: boolean | null;
    started: number;
    answered: number;
    completed: number;
    players: number;
};

type SignupRow = {
    name: string;
    method: string | null;
    was_guest: boolean | null;
    n: number;
};

const EMPTY_SEGMENT: FunnelVisitSegment = {
    visits: 0,
    demoAnswered: 0,
    modeOpened: 0,
    authPageViewed: 0,
    gameStarted: 0,
    gameCompleted: 0,
    shared: 0,
};

const EMPTY_GAMES: FunnelGamesRow = { started: 0, answered: 0, completed: 0 };

function toSegment(row: VisitRow | undefined): FunnelVisitSegment {
    if (!row) return EMPTY_SEGMENT;
    return {
        visits: row.visits,
        demoAnswered: row.demo,
        modeOpened: row.sheet,
        authPageViewed: row.auth_page,
        gameStarted: row.started,
        gameCompleted: row.completed,
        shared: row.shared,
    };
}

function toGames(row: GamesRow | undefined): FunnelGamesRow {
    if (!row) return EMPTY_GAMES;
    return { started: row.started, answered: row.answered, completed: row.completed };
}

/** Сырые строки запросов → отчёт. Отдельно от SQL — проверяется тестами. */
export function buildFunnelReport(input: {
    periodDays: FunnelPeriodDays;
    visits: VisitRow[];
    sources: FunnelSourceRow[];
    games: GamesRow[];
    replay: { completers: number; replayed: number } | undefined;
    challenges: { created: number; accepted: number } | undefined;
    signups: SignupRow[];
    retention: FunnelReport['retention'] | undefined;
}): FunnelReport {
    // GROUPING SETS: строка режима — mode задан; строка гость/аккаунт —
    // задан is_guest; общий итог — оба NULL.
    const modeRows = input.games.filter((row) => row.mode !== null);
    const guestRow = input.games.find((row) => row.mode === null && row.is_guest === true);
    const accountRow = input.games.find(
        (row) => row.mode === null && row.is_guest === false,
    );
    const totalRow = input.games.find(
        (row) => row.mode === null && row.is_guest === null,
    );

    const modes: FunnelGameMode[] = ['classic', 'blitz', 'survival', 'daily', 'challenge'];
    const gamesByMode = Object.fromEntries(
        modes.map((mode) => [mode, toGames(modeRows.find((row) => row.mode === mode))]),
    ) as Record<FunnelGameMode, FunnelGamesRow>;

    const signups = input.signups.filter((row) => row.name === 'signup');
    const countMethod = (method: string) =>
        signups.filter((row) => row.method === method).reduce((sum, row) => sum + row.n, 0);

    return {
        periodDays: input.periodDays,
        visitsAnonymous: toSegment(input.visits.find((row) => row.anonymous)),
        visitsSignedIn: toSegment(input.visits.find((row) => !row.anonymous)),
        sources: input.sources,
        gamesByMode,
        gamesTotal: toGames(totalRow),
        players: {
            total: totalRow?.players ?? 0,
            guests: guestRow?.players ?? 0,
            accounts: accountRow?.players ?? 0,
        },
        replay: input.replay ?? { completers: 0, replayed: 0 },
        challenges: input.challenges ?? { created: 0, accepted: 0 },
        signups: {
            total: signups.reduce((sum, row) => sum + row.n, 0),
            fromGuest: signups
                .filter((row) => row.was_guest === true)
                .reduce((sum, row) => sum + row.n, 0),
            byMethod: {
                password: countMethod('password'),
                yandex: countMethod('yandex'),
                vk: countMethod('vk'),
            },
            guestMerged: input.signups
                .filter((row) => row.name === 'guest_merged')
                .reduce((sum, row) => sum + row.n, 0),
        },
        retention: input.retention ?? {
            newPlayers: 0,
            d1Eligible: 0,
            d1Returned: 0,
            w1Eligible: 0,
            w1Returned: 0,
        },
    };
}

export function isFunnelPeriodDays(value: number): value is FunnelPeriodDays {
    return (FUNNEL_PERIOD_DAYS as readonly number[]).includes(value);
}

/** Весь отчёт за период: семь коротких SELECT на одном pooled-соединении. */
export async function findFunnelReport(
    periodDays: FunnelPeriodDays,
): Promise<FunnelReport> {
    return withPooledPgReadClient(async (client) => {
        const params = [periodDays];
        const visits = await client.query<VisitRow>(VISITS_SQL, params);
        const sources = await client.query<FunnelSourceRow & { started: number }>(
            SOURCES_SQL,
            params,
        );
        const games = await client.query<GamesRow>(GAMES_SQL, params);
        const replay = await client.query<{ completers: number; replayed: number }>(
            REPLAY_SQL,
            params,
        );
        const challenges = await client.query<{ created: number; accepted: number }>(
            CHALLENGES_SQL,
            params,
        );
        const signups = await client.query<SignupRow>(SIGNUPS_SQL, params);
        const retention = await client.query<{
            new_players: number;
            d1_eligible: number;
            d1_returned: number;
            w1_eligible: number;
            w1_returned: number;
        }>(RETENTION_SQL, params);

        const retentionRow = retention.rows[0];

        return buildFunnelReport({
            periodDays,
            visits: visits.rows,
            sources: sources.rows.map((row) => ({
                source: row.source,
                visits: row.visits,
                gameStarted: row.started,
            })),
            games: games.rows,
            replay: replay.rows[0],
            challenges: challenges.rows[0],
            signups: signups.rows,
            retention: retentionRow
                ? {
                      newPlayers: retentionRow.new_players,
                      d1Eligible: retentionRow.d1_eligible,
                      d1Returned: retentionRow.d1_returned,
                      w1Eligible: retentionRow.w1_eligible,
                      w1Returned: retentionRow.w1_returned,
                  }
                : undefined,
        });
    });
}
