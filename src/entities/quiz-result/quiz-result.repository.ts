// Работа с результатами викторин
import { withDirectPgClient } from '@/lib/db/direct-pg';
import { parseSnapshotData } from '@/entities/quiz-session/quiz-session-snapshot';
import type { Difficulty } from '@/types';

type QuizResultRow = {
    id: string;
    session_id: string;
    user_id: string;
    score: number;
    total_questions: number;
    correct_count: number;
    completed_at: Date;
    snapshot_data: string | null;
    question_count: number;
    timed_ends_at: Date | string | null;
    difficulty: Difficulty;
};

type ReviewAnswerRow = {
    question_id: string;
    selected_option_id: string;
    is_correct: boolean;
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
 * Опциональный фильтр рейтинга.
 * - difficulty `all` / omit = без JOIN на QuizSession;
 * - конкретная сложность = best среди сессий этой difficulty (JOIN Session);
 * - completedAfter = только результаты с `completedAt >=` этой даты;
 * - omit / null completedAfter = без нижней границы даты.
 *
 * Семантику week/month считает feature-слой (`getLeaderboardPeriodCutoff`);
 * entity знает только Date — без зависимости features → entities наоборот.
 * Difficulty в SQL только из allowlist выше по стеку (Zod на page).
 */
export type FindBestScoresFilters = {
    difficulty?: Difficulty | 'all';
    /** Нижняя граница `QuizResult.completedAt` (скользящее окно). */
    completedAfter?: Date | null;
};

type RecentResultRow = {
    session_id: string;
    score: number;
    total_questions: number;
    correct_count: number;
    completed_at: Date;
    difficulty: 'EASY' | 'MEDIUM' | 'HARD';
};

/** Одна строка агрегата профиля — COUNT всегда есть; MAX/ROUND могут быть null. */
type ProfileStatsRow = {
    quizzes_completed: number;
    best_score: number | null;
    average_accuracy_percent: number | null;
    last_played_at: Date | null;
};

async function loadResultBySessionIdForUser(sessionId: string, userId: string) {
    // Один Direct-клиент: score + snapshot + answers.
    // Иначе после submit второй TLS на review часто клинит Windows+Neon
    // (см. withDirectPgQueue в direct-pg.ts).
    const loaded = await withDirectPgClient(async (client) => {
        const result = await client.query<QuizResultRow>(
            `
                SELECT
                    r."id",
                    r."sessionId" AS "session_id",
                    r."userId" AS "user_id",
                    r."score",
                    r."totalQuestions" AS "total_questions",
                    r."correctCount" AS "correct_count",
                    r."completedAt" AS "completed_at",
                    s."snapshotData" AS "snapshot_data",
                    s."questionCount" AS "question_count",
                    s."timedEndsAt" AS "timed_ends_at",
                    s."difficulty"::text AS "difficulty"
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
            row,
            answers: answersResult.rows.map((answer) => ({
                questionId: answer.question_id,
                selectedOptionId: answer.selected_option_id,
                isCorrect: answer.is_correct,
            })),
        };
    });

    if (!loaded) {
        return null;
    }

    const { row, answers } = loaded;
    const snapshot = parseSnapshotData(row.snapshot_data);
    const difficulties: Difficulty[] =
        snapshot && snapshot.questions.length === row.question_count
            ? snapshot.questions.map((question) => question.difficulty)
            : [];

    return {
        id: row.id,
        sessionId: row.session_id,
        userId: row.user_id,
        score: row.score,
        totalQuestions: row.total_questions,
        correctCount: row.correct_count,
        completedAt: row.completed_at,
        /** Для summary «score / max» без второго round-trip на review. */
        difficulties,
        /** Timed session → rematch CTA ведёт к Timed, не к classic setup. */
        isTimed: row.timed_ends_at != null,
        /** Сложность сессии — для Timed rematch с теми же правилами. */
        difficulty: row.difficulty,
        /**
         * Сырьё для mapQuizResultReview на page (тот же connect, что score).
         * null если snapshot битый — UI покажет soft-fail только на review.
         */
        review:
            snapshot && snapshot.questions.length === row.question_count
                ? {
                      sessionId: row.session_id,
                      questionCount: row.question_count,
                      snapshotData: snapshot,
                      answers,
                  }
                : null,
    };
}

// репозиторий для работы с результатами викторины
export const quizResultRepository = {
    /**
     * Лучший результат на пользователя — unpooled pg (Neon-friendly).
     *
     * Ветки (JOIN Session только если нужен difficulty):
     * - без фильтров → DISTINCT ON по QuizResult (быстрый путь);
     * - только completedAfter → WHERE completedAt >= $cutoff (без JOIN);
     * - только difficulty → JOIN Session + WHERE difficulty;
     * - оба → JOIN + оба WHERE.
     *
     * Параметры: limit + allowlist difficulty + Date cutoff из feature-слоя.
     * См. DECISIONS.md → Leaderboard.
     */
    async findBestScores(limit: number, filters?: FindBestScoresFilters) {
        const difficulty = filters?.difficulty;
        const filterByDifficulty =
            difficulty === 'EASY' ||
            difficulty === 'MEDIUM' ||
            difficulty === 'HARD';
        const completedAfter = filters?.completedAfter ?? null;

        const params: unknown[] = [limit];
        const whereParts: string[] = [];

        // JOIN нужен только для фильтра по сложности сессии — дата живёт на QuizResult.
        const sessionJoin = filterByDifficulty
            ? `INNER JOIN "QuizSession" AS s ON s."id" = r."sessionId"`
            : '';

        if (filterByDifficulty) {
            params.push(difficulty);
            whereParts.push(`s."difficulty" = $${params.length}`);
        }

        if (completedAfter) {
            params.push(completedAfter);
            whereParts.push(`r."completedAt" >= $${params.length}`);
        }

        const whereSql =
            whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

        const result = await withDirectPgClient((client) =>
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
                        FROM "QuizResult" AS r
                        ${sessionJoin}
                        ${whereSql}
                        ORDER BY
                            r."userId" ASC,
                            r."score" DESC,
                            r."completedAt" ASC
                    ) AS best
                    INNER JOIN "User" AS u ON u."id" = best."userId"
                    ORDER BY
                        best."score" DESC,
                        best."completedAt" ASC
                    LIMIT $1
                `,
                params,
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
    },

    // поиск результата викторины по ID сессии и ID пользователя
    findBySessionIdForUser(sessionId: string, userId: string) {
        return loadResultBySessionIdForUser(sessionId, userId);
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
                        s."difficulty" AS "difficulty"
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
                difficulty: row.difficulty,
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
