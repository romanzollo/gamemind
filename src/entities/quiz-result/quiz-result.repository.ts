// Работа с результатами викторин
import { withDirectPgClient } from '@/lib/db/direct-pg';
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

/** Result review load: slim payload (B) или legacy snapshot+answers. */
export type QuizResultReviewLoad =
    | {
          kind: 'payload';
          sessionId: string;
          payload: CompactReviewPayloadV1;
      }
    | {
          kind: 'snapshot';
          bundle: QuizResultReviewBundle;
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
export type FindBestScoresMode = 'classic' | 'blitz' | 'daily';

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
    if (mode === 'blitz' || mode === 'daily') {
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
        difficulty: row.difficulty,
        poolKind,
        setupDifficulty,
    };
}

/**
 * Review: сначала slim reviewPayload (option B), иначе legacy reviewSnapshot/TOAST.
 * Не блокирует summary.
 */
async function loadResultReviewBySessionIdForUser(
    sessionId: string,
    userId: string,
): Promise<QuizResultReviewLoad | null> {
    const loaded = await withDirectPgClient(
        async (client) => {
            const result = await client.query<{
                review_payload: unknown;
                review_snapshot: unknown;
                question_count: number;
            }>(
                `
                SELECT
                    r."reviewPayload" AS "review_payload",
                    r."reviewSnapshot" AS "review_snapshot",
                    s."questionCount" AS "question_count"
                FROM "QuizResult" r
                INNER JOIN "QuizSession" s
                    ON s."id" = r."sessionId"
                WHERE r."sessionId" = $1 AND r."userId" = $2
                LIMIT 1
            `,
                [sessionId, userId],
            );

            const row = result.rows[0];

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

            let snapshot = parseSnapshotData(
                row.review_snapshot as string | null,
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
                return null;
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
            // Payload path should be fast; legacy TOAST: 1×8s soft-fail.
            maxAttempts: 1,
            attemptTimeoutMs: 8_000,
        },
    );

    return loaded;
}

// репозиторий для работы с результатами викторины
export const quizResultRepository = {
    /**
     * Лучший результат на пользователя внутри доски — unpooled pg.
     *
     * Всегда JOIN QuizSession: mode режет потолки (скаляры, не JSONB).
     * Difficulty / completedAfter — дополнительные WHERE.
     * Blitz ORDER BY длительности только в этой ветке.
     *
     * См. DECISIONS.md → Leaderboard retention meta — Layer 1.
     */
    async findBestScores(limit: number, filters?: FindBestScoresFilters) {
        const mode = resolveLeaderboardMode(filters?.mode);
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
