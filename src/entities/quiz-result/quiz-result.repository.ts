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
    is_daily: boolean;
    topic_tag_id: string | null;
    topic_name_ru: string | null;
    topic_name_en: string | null;
    friend_challenge_id: string | null;
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
    /**
     * Челлендж дня ⇔ dailyChallengeId IS NOT NULL. Rematch после Daily —
     * обычная Классика (челлендж один раз), поэтому другая подпись кнопки.
     */
    isDaily: boolean;
    /** Null если не Survival. Нужен для continue CTA / eligibility. */
    survivalRunId: string | null;
    /** Null до complete / если не Survival. */
    survivalClockOk: boolean | null;
    difficulty: Difficulty | null;
    poolKind: QuizSessionPoolKind;
    /** Hidden rematch: MIXED или EASY|MEDIUM|HARD. */
    setupDifficulty: QuizSetupDifficulty;
    /** Тема игры (подпись + rematch с той же темой); null — весь банк. */
    topic: QuizResultTopic | null;
    /** Попытка «Вызова другу»; null — обычная игра. */
    friendChallengeId: string | null;
};

export type QuizResultTopic = {
    id: string;
    nameRu: string;
    nameEn: string;
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

/**
 * Режим игры для рейтинга (очки по режиму, рекорды, rating-points.repository).
 * Дискриминация только скалярами QuizSession (DECISIONS → Leaderboard Layer 1).
 * Classic: dailyChallengeId / timedEndsAt / survivalRunId все NULL.
 */
export type FindBestScoresMode = 'classic' | 'blitz' | 'daily' | 'survival';

/**
 * Игры по «Вызову другу» в рейтинг не идут: второй аккаунт, видевший ответы
 * автора, накручивал бы доску (DECISIONS → Friend challenge).
 */
export const NOT_FRIEND_CHALLENGE_SQL = 's."friendChallengeId" IS NULL';

/**
 * WHERE по скалярам сессии — без snapshotData.
 * Classic / Blitz: только партии на всём банке (`topicTagId IS NULL`) —
 * фанат шутеров не должен подниматься, выбирая свою тему (Play topics) —
 * и не по вызову друга.
 */
export function leaderboardModeWhereSql(mode: FindBestScoresMode): string[] {
    if (mode === 'daily') {
        return ['s."dailyChallengeId" IS NOT NULL'];
    }

    if (mode === 'blitz') {
        return [
            's."dailyChallengeId" IS NULL',
            's."timedEndsAt" IS NOT NULL',
            's."topicTagId" IS NULL',
            NOT_FRIEND_CHALLENGE_SQL,
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
        's."topicTagId" IS NULL',
        NOT_FRIEND_CHALLENGE_SQL,
    ];
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
 * Название темы — LEFT JOIN Tag по PK (скаляры, не новый hop).
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
                    s."poolKind"::text AS "pool_kind",
                    (s."dailyChallengeId" IS NOT NULL) AS "is_daily",
                    s."topicTagId" AS "topic_tag_id",
                    topic."nameRu" AS "topic_name_ru",
                    topic."nameEn" AS "topic_name_en",
                    s."friendChallengeId" AS "friend_challenge_id"
                FROM "QuizResult" r
                INNER JOIN "QuizSession" s
                    ON s."id" = r."sessionId"
                LEFT JOIN "Tag" topic
                    ON topic."id" = s."topicTagId"
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
        isDaily: row.is_daily === true,
        survivalRunId: row.survival_run_id,
        survivalClockOk: row.survival_clock_ok,
        difficulty: row.difficulty,
        poolKind,
        setupDifficulty,
        topic:
            row.topic_tag_id && row.topic_name_ru && row.topic_name_en
                ? {
                      id: row.topic_tag_id,
                      nameRu: row.topic_name_ru,
                      nameEn: row.topic_name_en,
                  }
                : null,
        friendChallengeId: row.friend_challenge_id,
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
