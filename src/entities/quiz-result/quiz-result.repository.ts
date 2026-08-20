// Работа с результатами викторин
import { withDirectPgClient, withPooledPgClient } from '@/lib/db/direct-pg';
import { parseSnapshotData } from '@/entities/quiz-session/quiz-session-snapshot';
import {
    parseCompactReviewPayload,
    type CompactReviewPayloadV1,
} from '@/entities/quiz-result/compact-review-payload';
import type { Difficulty, QuizSessionPoolKind, QuizSetupDifficulty } from '@/types';

type QuizResultSummaryRow = {
    id: string;
    session_id: string;
    user_id: string;
    score: number;
    total_questions: number;
    correct_count: number;
    completed_at: Date;
    question_count: number;
    timed_ends_at: Date | string | null;
    survival_run_id: string | null;
    survival_clock_ok: boolean | null;
    difficulty: Difficulty | null;
    pool_kind: string | null;
};

type ReviewAnswerRow = {
    question_id: string;
    selected_option_id: string;
    is_correct: boolean;
};

export type QuizResultSummary = {
    id: string;
    sessionId: string;
    userId: string;
    score: number;
    totalQuestions: number;
    correctCount: number;
    completedAt: Date;
    /**
     * SINGLE: одна difficulty, повторённая totalQuestions раз (max без JSONB).
     * MIXED: пусто — max считает feature по сплиту, не по session.difficulty.
     */
    difficulties: Difficulty[];
    isTimed: boolean;
    /** Survival ⇔ survivalRunId IS NOT NULL (не timedEndsAt). */
    isSurvival: boolean;
    /** Null если не Survival. Нужен для continue CTA / eligibility. */
    survivalRunId: string | null;
    /** Null до complete / если не Survival. */
    survivalClockOk: boolean | null;
    difficulty: Difficulty | null;
    poolKind: QuizSessionPoolKind;
    /** Hidden rematch: MIXED или EASY|MEDIUM|HARD. */
    setupDifficulty: QuizSetupDifficulty;
};

export type QuizResultReviewBundle = {
    sessionId: string;
    questionCount: number;
    snapshotData: NonNullable<ReturnType<typeof parseSnapshotData>>;
    answers: Array<{
        questionId: string;
        selectedOptionId: string;
        isCorrect: boolean;
    }>;
};

/** Result review load: slim payload (B), legacy snapshot+answers, или ещё нет payload. */
export type QuizResultReviewLoad =
    | {
          kind: 'payload';
          sessionId: string;
          payload: CompactReviewPayloadV1;
      }
    | {
          kind: 'snapshot';
          bundle: QuizResultReviewBundle;
      }
    | {
          kind: 'pending';
          sessionId: string;
      };

type LeaderboardScoreRow = {
    user_id: string;
    username: string;
    score: number;
    total_questions: number;
    correct_count: number;
    completed_at: Date;
};

/**
 * Режим публичной доски. Не play-mode Survival.
 * Дискриминация только скалярами QuizSession (DECISIONS → Leaderboard Layer 1).
 * Classic: dailyChallengeId / timedEndsAt / survivalRunId все NULL.
 */
export type FindBestScoresMode = 'classic' | 'blitz' | 'daily' | 'survival';

/**
 * Фильтр рейтинга.
 * JOIN Session всегда: mode режет Classic / Blitz / Daily по скалярам.
 * Classic дополнительно `survivalRunId IS NULL` — иначе HARD-волна 36
 * попадёт на недельную доску (DECISIONS → Survival Mode MVP + Layer 1).
 * - difficulty omit/`all` = все сложности внутри mode (mix входит в «все»);
 * - EASY|MEDIUM|HARD = poolKind SINGLE + эта difficulty (mix не в Medium);
 * - MIXED = poolKind MIXED;
 * - completedAfter = `QuizResult.completedAt >=` даты; null/omit = без окна.
 *
 * Семантику week/month считает feature (`getLeaderboardPeriodCutoff`);
 * entity знает Date и mode — без features → entities.
 * mode / difficulty в SQL только из allowlist (Zod на page). Omit mode = classic:
 * не смешивать потолки, даже если page забыл передать поле.
 */
export type FindBestScoresFilters = {
    difficulty?: Difficulty | 'MIXED' | 'all';
    /** Нижняя граница `QuizResult.completedAt` (скользящее окно). */
    completedAfter?: Date | null;
    /** Omit = classic. Нет значения «все режимы». */
    mode?: FindBestScoresMode;
};

function resolveLeaderboardMode(
    mode: FindBestScoresMode | undefined,
): FindBestScoresMode {
    if (mode === 'blitz' || mode === 'daily' || mode === 'survival') {
        return mode;
    }

    return 'classic';
}

/** WHERE по скалярам сессии — без snapshotData. */
function leaderboardModeWhereSql(mode: FindBestScoresMode): string[] {
    if (mode === 'daily') {
        return ['s."dailyChallengeId" IS NOT NULL'];
    }

    if (mode === 'blitz') {
        return [
            's."dailyChallengeId" IS NULL',
            's."timedEndsAt" IS NOT NULL',
        ];
    }
    if (mode === 'survival') {
        return [
            's."survivalRunId" IS NOT NULL',
            's."survivalClockOk" IS TRUE',
        ];
    }

    return [
        's."dailyChallengeId" IS NULL',
        's."timedEndsAt" IS NULL',
        's."survivalRunId" IS NULL',
    ];
}

/**
 * DISTINCT ON требует, чтобы ORDER BY начинался с userId.
 * Blitz: равный score → меньшая длительность выше. Classic/Daily этим ключом
 * не сортируем — только completedAt (иначе классика стала бы гонкой на скорость).
 */
function leaderboardBestOrderSql(mode: FindBestScoresMode): {
    durationSelect: string;
    innerOrderBy: string;
    outerOrderBy: string;
} {
    if (mode === 'blitz') {
        return {
            durationSelect: `, (r."completedAt" - s."startedAt") AS "duration"`,
            innerOrderBy:
                'r."userId" ASC, r."score" DESC, (r."completedAt" - s."startedAt") ASC, r."completedAt" ASC',
            outerOrderBy:
                'best."score" DESC, best."duration" ASC, best."completedAt" ASC',
        };
    }

    return {
        durationSelect: '',
        innerOrderBy: 'r."userId" ASC, r."score" DESC, r."completedAt" ASC',
        outerOrderBy: 'best."score" DESC, best."completedAt" ASC',
    };
}

function parseSessionPoolKind(value: string | null): QuizSessionPoolKind {
    return value === 'MIXED' ? 'MIXED' : 'SINGLE';
}

function parseSetupDifficulty(
    poolKind: QuizSessionPoolKind,
    difficulty: Difficulty | null,
): QuizSetupDifficulty {
    if (poolKind === 'MIXED') {
        return 'MIXED';
    }

    if (
        difficulty === 'EASY' ||
        difficulty === 'MEDIUM' ||
        difficulty === 'HARD'
    ) {
        return difficulty;
    }

    return 'EASY';
}

/**
 * Survival board: best run totalScore per user (не best одна волна).
 * Period = startedAt run в окне; difficulty = SurvivalRun.difficulty.
 * totalQuestions / correctCount — SUM clockOk-волн того же run.
 */
async function findBestSurvivalRunScores(
    limit: number,
    filters?: FindBestScoresFilters,
) {
    const difficulty = filters?.difficulty;
    const filterBySingle =
        difficulty === 'EASY' ||
        difficulty === 'MEDIUM' ||
        difficulty === 'HARD';
    const completedAfter = filters?.completedAfter ?? null;

    const params: unknown[] = [limit];
    const whereParts: string[] = ['sr."totalScore" > 0'];

    if (filterBySingle) {
        params.push(difficulty);
        whereParts.push(
            `sr."difficulty" = $${params.length}::"Difficulty"`,
        );
    }

    if (completedAfter) {
        params.push(completedAfter);
        whereParts.push(`sr."startedAt" >= $${params.length}`);
    }

    const whereSql = `WHERE ${whereParts.join(' AND ')}`;

    const result = await withDirectPgClient(
        (client) =>
            client.query<LeaderboardScoreRow>(
                `
                SELECT
                    best."userId" AS "user_id",
                    u."username" AS "username",
                    best."score" AS "score",
                    best."totalQuestions" AS "total_questions",
                    best."correctCount" AS "correct_count",
                    best."completedAt" AS "completed_at"
                FROM (
                    SELECT DISTINCT ON (sr."userId")
                        sr."userId",
                        sr."totalScore" AS "score",
                        COALESCE(agg."total_questions", 0) AS "totalQuestions",
                        COALESCE(agg."correct_count", 0) AS "correctCount",
                        COALESCE(sr."completedAt", agg."last_completed", sr."startedAt")
                            AS "completedAt"
                    FROM "SurvivalRun" AS sr
                    LEFT JOIN LATERAL (
                        SELECT
                            SUM(r."totalQuestions")::int AS "total_questions",
                            SUM(r."correctCount")::int AS "correct_count",
                            MAX(r."completedAt") AS "last_completed"
                        FROM "QuizResult" AS r
                        INNER JOIN "QuizSession" AS s
                            ON s."id" = r."sessionId"
                        WHERE
                            s."survivalRunId" = sr."id"
                            AND s."survivalClockOk" IS TRUE
                    ) AS agg ON TRUE
                    ${whereSql}
                    ORDER BY
                        sr."userId" ASC,
                        sr."totalScore" DESC,
                        COALESCE(sr."completedAt", agg."last_completed", sr."startedAt") ASC
                ) AS best
                INNER JOIN "User" AS u ON u."id" = best."userId"
                ORDER BY
                    best."score" DESC,
                    best."completedAt" ASC
                LIMIT $1
            `,
                params,
            ),
        {
            debugLabel: 'leaderboard.best-survival-runs',
        },
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

type RecentResultRow = {
    session_id: string;
    score: number;
    total_questions: number;
    correct_count: number;
    completed_at: Date;
    difficulty: Difficulty | null;
    pool_kind: string | null;
};

/** Одна строка агрегата профиля — COUNT всегда есть; MAX/ROUND могут быть null. */
type ProfileStatsRow = {
    quizzes_completed: number;
    best_score: number | null;
    average_accuracy_percent: number | null;
    last_played_at: Date | null;
};

/**
 * Summary без JSONB: сразу после submit нельзя читать reviewSnapshot/TOAST
 * (connect OK → operation ~18s). Score/rematch живут на скалярах + Session.
 */
async function loadResultSummaryBySessionIdForUser(
    sessionId: string,
    userId: string,
): Promise<QuizResultSummary | null> {
    const result = await withDirectPgClient(
        (client) =>
            client.query<QuizResultSummaryRow>(
                `
                SELECT
                    r."id",
                    r."sessionId" AS "session_id",
                    r."userId" AS "user_id",
                    r."score",
                    r."totalQuestions" AS "total_questions",
                    r."correctCount" AS "correct_count",
                    r."completedAt" AS "completed_at",
                    s."questionCount" AS "question_count",
                    s."timedEndsAt" AS "timed_ends_at",
                    s."survivalRunId" AS "survival_run_id",
                    s."survivalClockOk" AS "survival_clock_ok",
                    s."difficulty"::text AS "difficulty",
                    s."poolKind"::text AS "pool_kind"
                FROM "QuizResult" r
                INNER JOIN "QuizSession" s
                    ON s."id" = r."sessionId"
                WHERE r."sessionId" = $1 AND r."userId" = $2
                LIMIT 1
            `,
                [sessionId, userId],
            ),
        {
            debugLabel: 'quiz.result.summary',
        },
    );

    const row = result.rows[0];

    if (!row) {
        return null;
    }

    const poolKind = parseSessionPoolKind(row.pool_kind);
    const setupDifficulty = parseSetupDifficulty(poolKind, row.difficulty);
    const sessionDifficulty = row.difficulty;

    // SINGLE: max без JSONB. MIXED: пусто — UI берёт getMixedMaxPossibleScore.
    const difficulties: Difficulty[] =
        poolKind === 'MIXED' || !sessionDifficulty
            ? []
            : Array.from(
                  { length: row.total_questions },
                  () => sessionDifficulty,
              );

    return {
        id: row.id,
        sessionId: row.session_id,
        userId: row.user_id,
        score: row.score,
        totalQuestions: row.total_questions,
        correctCount: row.correct_count,
        completedAt: row.completed_at,
        difficulties,
        isTimed: row.timed_ends_at != null,
        isSurvival: row.survival_run_id != null,
        survivalRunId: row.survival_run_id,
        survivalClockOk: row.survival_clock_ok,
        difficulty: row.difficulty,
        poolKind,
        setupDifficulty,
    };
}

/**
 * Review: сначала slim reviewPayload (option B), без TOAST на Direct.
 *
 * Почему pooled: в next-dev Direct queue одна на процесс. Complete ~19s
 * + JSONB attach на той же очереди → review API 8s 503, score уже на экране.
 * Payload-only SELECT не трогает `reviewSnapshot` / `snapshotData`.
 * Legacy TOAST — только если строка старше гонки attach (~20с).
 * Нет payload и нет snapshot → `pending` (API 503, клиент ретраит).
 */
async function loadResultReviewBySessionIdForUser(
    sessionId: string,
    userId: string,
): Promise<QuizResultReviewLoad | null> {
    const REVIEW_ATTACH_RACE_MS = 20_000;

    return withPooledPgClient(
        async (client) => {
            const payloadResult = await client.query<{
                review_payload: unknown;
                completed_at: Date;
                question_count: number;
            }>(
                `
                SELECT
                    r."reviewPayload" AS "review_payload",
                    r."completedAt" AS "completed_at",
                    s."questionCount" AS "question_count"
                FROM "QuizResult" r
                INNER JOIN "QuizSession" s
                    ON s."id" = r."sessionId"
                WHERE r."sessionId" = $1 AND r."userId" = $2
                LIMIT 1
            `,
                [sessionId, userId],
            );

            const row = payloadResult.rows[0];

            if (!row) {
                return null;
            }

            const compact = parseCompactReviewPayload(row.review_payload);

            if (compact) {
                return {
                    kind: 'payload' as const,
                    sessionId,
                    payload: compact,
                };
            }

            const completedAtMs = new Date(row.completed_at).getTime();
            const ageMs = Number.isNaN(completedAtMs)
                ? Number.POSITIVE_INFINITY
                : Date.now() - completedAtMs;

            // Свежий complete: attach ещё в полёте — не читать snapshot TOAST.
            if (ageMs < REVIEW_ATTACH_RACE_MS) {
                return {
                    kind: 'pending' as const,
                    sessionId,
                };
            }

            const toastResult = await client.query<{
                review_snapshot: unknown;
            }>(
                `
                SELECT r."reviewSnapshot" AS "review_snapshot"
                FROM "QuizResult" r
                WHERE r."sessionId" = $1 AND r."userId" = $2
                LIMIT 1
            `,
                [sessionId, userId],
            );

            let snapshot = parseSnapshotData(
                toastResult.rows[0]?.review_snapshot as string | null,
            );

            if (!snapshot) {
                const legacy = await client.query<{
                    snapshot_data: unknown;
                }>(
                    `
                    SELECT "snapshotData" AS "snapshot_data"
                    FROM "QuizSession"
                    WHERE "id" = $1 AND "userId" = $2
                    LIMIT 1
                `,
                    [sessionId, userId],
                );
                snapshot = parseSnapshotData(
                    legacy.rows[0]?.snapshot_data as string | null,
                );
            }

            if (!snapshot || snapshot.questions.length !== row.question_count) {
                return {
                    kind: 'pending' as const,
                    sessionId,
                };
            }

            const answersResult = await client.query<ReviewAnswerRow>(
                `
                SELECT
                    "questionId" AS "question_id",
                    "selectedOptionId" AS "selected_option_id",
                    "isCorrect" AS "is_correct"
                FROM "QuizAnswer"
                WHERE "sessionId" = $1
            `,
                [sessionId],
            );

            return {
                kind: 'snapshot' as const,
                bundle: {
                    sessionId,
                    questionCount: row.question_count,
                    snapshotData: snapshot,
                    answers: answersResult.rows.map((answer) => ({
                        questionId: answer.question_id,
                        selectedOptionId: answer.selected_option_id,
                        isCorrect: answer.is_correct,
                    })),
                },
            };
        },
        {
            debugLabel: 'quiz.result.review',
            attemptTimeoutMs: 8_000,
        },
    );
}

// репозиторий для работы с результатами викторины
export const quizResultRepository = {
    /**
     * Лучший результат на пользователя внутри доски — unpooled pg.
     *
     * Classic/Blitz/Daily: JOIN QuizSession + QuizResult (скаляры, не JSONB).
     * Survival: best `SurvivalRun.totalScore` per user (сумма clockOk-волн).
     * Difficulty / completedAfter — дополнительные WHERE.
     * Blitz ORDER BY длительности только в blitz-ветке.
     *
     * См. DECISIONS.md → Leaderboard retention meta — Layer 1 + Survival wave 2+.
     */
    async findBestScores(limit: number, filters?: FindBestScoresFilters) {
        const mode = resolveLeaderboardMode(filters?.mode);

        if (mode === 'survival') {
            return findBestSurvivalRunScores(limit, filters);
        }

        const difficulty = filters?.difficulty;
        const filterBySingle =
            difficulty === 'EASY' ||
            difficulty === 'MEDIUM' ||
            difficulty === 'HARD';
        const filterByMixed = difficulty === 'MIXED';
        const completedAfter = filters?.completedAfter ?? null;
        const orderSql = leaderboardBestOrderSql(mode);

        const params: unknown[] = [limit];
        const whereParts: string[] = [...leaderboardModeWhereSql(mode)];

        if (filterByMixed) {
            params.push('MIXED');
            whereParts.push(
                `s."poolKind" = $${params.length}::"QuizSessionPoolKind"`,
            );
        } else if (filterBySingle) {
            params.push('SINGLE');
            whereParts.push(
                `s."poolKind" = $${params.length}::"QuizSessionPoolKind"`,
            );
            params.push(difficulty);
            whereParts.push(
                `s."difficulty" = $${params.length}::"Difficulty"`,
            );
        }

        if (completedAfter) {
            params.push(completedAfter);
            whereParts.push(`r."completedAt" >= $${params.length}`);
        }

        const whereSql = `WHERE ${whereParts.join(' AND ')}`;

        const result = await withDirectPgClient(
            (client) =>
                client.query<LeaderboardScoreRow>(
                    `
                    SELECT
                        best."userId" AS "user_id",
                        u."username" AS "username",
                        best."score" AS "score",
                        best."totalQuestions" AS "total_questions",
                        best."correctCount" AS "correct_count",
                        best."completedAt" AS "completed_at"
                    FROM (
                        SELECT DISTINCT ON (r."userId")
                            r."userId",
                            r."score",
                            r."totalQuestions",
                            r."correctCount",
                            r."completedAt"
                            ${orderSql.durationSelect}
                        FROM "QuizResult" AS r
                        INNER JOIN "QuizSession" AS s ON s."id" = r."sessionId"
                        ${whereSql}
                        ORDER BY
                            ${orderSql.innerOrderBy}
                    ) AS best
                    INNER JOIN "User" AS u ON u."id" = best."userId"
                    ORDER BY
                        ${orderSql.outerOrderBy}
                    LIMIT $1
                `,
                    params,
                ),
            {
                debugLabel: 'leaderboard.best-scores',
            },
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
    },

    /** Score/rematch без JSONB — critical path после submit. */
    findSummaryBySessionIdForUser(sessionId: string, userId: string) {
        return loadResultSummaryBySessionIdForUser(sessionId, userId);
    },

    /** Разбор: slim reviewPayload (B) или legacy snapshot. */
    findReviewBySessionIdForUser(sessionId: string, userId: string) {
        return loadResultReviewBySessionIdForUser(sessionId, userId);
    },

    // последние результаты пользователя (профиль) — unpooled pg
    async findRecentByUserId(userId: string, limit: number) {
        const result = await withDirectPgClient((client) =>
            client.query<RecentResultRow>(
                `
                    SELECT
                        r."sessionId" AS "session_id",
                        r."score" AS "score",
                        r."totalQuestions" AS "total_questions",
                        r."correctCount" AS "correct_count",
                        r."completedAt" AS "completed_at",
                        s."difficulty" AS "difficulty",
                        s."poolKind"::text AS "pool_kind"
                    FROM "QuizResult" AS r
                    INNER JOIN "QuizSession" AS s ON s."id" = r."sessionId"
                    WHERE r."userId" = $1
                    ORDER BY r."completedAt" DESC
                    LIMIT $2
                `,
                [userId, limit],
            ),
        );

        return result.rows.map((row) => ({
            sessionId: row.session_id,
            score: row.score,
            totalQuestions: row.total_questions,
            correctCount: row.correct_count,
            completedAt: row.completed_at,
            session: {
                difficulty: parseSetupDifficulty(
                    parseSessionPoolKind(row.pool_kind),
                    row.difficulty,
                ),
            },
        }));
    },

    /**
     * Сводка профиля: один SELECT по QuizResult (не история, не leaderboard).
     * Без JOIN на QuizSession — difficulty для stats не нужен.
     * Aggregate без GROUP BY всегда возвращает 1 строку (COUNT=0, если игр не было).
     */
    async findStatsByUserId(userId: string) {
        const result = await withDirectPgClient((client) =>
            client.query<ProfileStatsRow>(
                `
                    SELECT
                        COUNT(*)::int AS "quizzes_completed",
                        MAX("score") AS "best_score",
                        CASE
                            WHEN COALESCE(SUM("totalQuestions"), 0) = 0 THEN NULL
                            ELSE ROUND(
                                100.0 * SUM("correctCount") / SUM("totalQuestions")
                            )::int
                        END AS "average_accuracy_percent",
                        MAX("completedAt") AS "last_played_at"
                    FROM "QuizResult"
                    WHERE "userId" = $1
                `,
                [userId],
            ),
        );

        const row = result.rows[0];
        const quizzesCompleted = Number(row?.quizzes_completed ?? 0);

        if (quizzesCompleted === 0) {
            return {
                quizzesCompleted: 0,
                bestScore: null,
                averageAccuracyPercent: null,
                lastPlayedAt: null,
            };
        }

        return {
            quizzesCompleted,
            bestScore:
                row?.best_score == null ? null : Number(row.best_score),
            averageAccuracyPercent:
                row?.average_accuracy_percent == null
                    ? null
                    : Number(row.average_accuracy_percent),
            lastPlayedAt: row?.last_played_at ?? null,
        };
    },
};
