/**
 * QuizSession reads: quiz page / scoring submit / result review.
 *
 * Зачем отдельный модуль (§11.7): read-path не должен жить в одном файле
 * со start/submit writes. SQL перенесён as-is — без rewrite.
 * Источник истины для UI и scoring — frozen snapshot (JSON v2, legacy
 * relational fallback). Owner-only: sessionId + userId в WHERE.
 * Публичный фасад: quiz-session.repository.ts.
 * См. docs/DECISIONS.md → Repository File Split.
 */

import type { Difficulty } from '@/types';
import type { Locale } from '@/shared/i18n';
import { prisma, withDatabaseRetry } from '@/lib/prisma';
import {
    isDirectPgTimeoutError,
    withDirectPgClient,
    withPooledPgClient,
} from '@/lib/db/direct-pg';
import { takeQuizPlayLoad } from '@/entities/quiz-session/play-load-handoff';
import { loadLocalizedTextsByQuestionIds } from '@/entities/question/question.repository';
import { normalizeQuizImageUrl } from '@/shared/utils/normalize-quiz-image-url';
import type {
    QuizSessionPublicView,
    SessionForSubmitResult,
    SessionReviewPayload,
    SessionSnapshotPublicQuestion,
    SessionSnapshotScoringQuestion,
} from '@/entities/quiz-session/quiz-session.types';
import type { QuizSessionSnapshotData } from '@/entities/quiz-session/quiz-session-snapshot';
import {
    hasBilingualTexts,
    mapSnapshotDataToPublicQuestions,
    mapSnapshotDataToScoringQuestions,
    parseSnapshotData,
    pickSnapshotText,
} from '@/entities/quiz-session/quiz-session-snapshot';

type SnapshotScoringRow = {
    session_id: string;
    question_count: number;
    timed_ends_at: Date | string | null;
    question_id: string | null;
    difficulty: Difficulty | null;
    option_id: string | null;
    is_correct: boolean | null;
};

type SessionSnapshotJsonRow = {
    session_id: string;
    question_count: number;
    snapshot_data: QuizSessionSnapshotData | string | null;
    timed_ends_at: Date | string | null;
    difficulty: Difficulty | null;
};

type ReviewAnswerRow = {
    question_id: string;
    selected_option_id: string;
    is_correct: boolean;
};

/** Date/string из pg → ISO для Client Component; null остаётся null. */
function toTimedEndsAtIso(
    value: Date | string | null | undefined,
): string | null {
    if (value == null) {
        return null;
    }

    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date.toISOString();
}

async function loadQuizSessionSnapshotData(
    sessionId: string,
    userId: string,
    debugLabel = 'quiz.session.load-snapshot',
    attemptTimeoutMs = 18_000,
): Promise<SessionSnapshotJsonRow | null> {
    // SELECT-only JSONB. Не Direct: сразу после create INSERT тот же TOAST
    // на unpooled клинит Classic MIX / Blitz SINGLE (~18s×2), пока Blitz MIX
    // и Classic SINGLE иногда проходят. Cycle уже на pooled вне очереди.
    // Timeout → null (страница retry / soft-miss), не throw на 37s overlay.
    try {
        const result = await withPooledPgClient(
            (client) =>
                client.query<SessionSnapshotJsonRow>(
                    `
                SELECT
                    "id" AS "session_id",
                    "questionCount" AS "question_count",
                    "snapshotData" AS "snapshot_data",
                    "timedEndsAt" AS "timed_ends_at",
                    "difficulty"::text AS "difficulty"
                FROM "QuizSession"
                WHERE
                    "id" = $1
                    AND "userId" = $2
                    AND "status" = 'IN_PROGRESS'::"QuizSessionStatus"
            `,
                    [sessionId, userId],
                ),
            {
                debugLabel,
                attemptTimeoutMs,
            },
        );

        return result.rows[0] ?? null;
    } catch (error) {
        if (isDirectPgTimeoutError(error)) {
            return null;
        }

        throw error;
    }
}

async function overlayPublicQuestionsWithLocale(
    questions: SessionSnapshotPublicQuestion[],
    locale: Locale,
): Promise<SessionSnapshotPublicQuestion[]> {
    const localized = await loadLocalizedTextsByQuestionIds(
        locale,
        questions.map((question) => question.id),
    );

    return questions.map((question) => {
        const overlay = localized.get(question.id);

        if (!overlay) {
            return question;
        }

        return {
            ...question,
            text: overlay.displayText || question.text,
            options: question.options.map((option) => ({
                ...option,
                text: overlay.options.get(option.id) || option.text,
            })),
        };
    });
}

async function loadSessionForSubmit(
    sessionId: string,
    userId: string,
): Promise<SessionForSubmitResult> {
    const jsonSnapshot = await loadQuizSessionSnapshotData(
        sessionId,
        userId,
        'quiz.submit.load-snapshot',
    );

    if (jsonSnapshot) {
        const snapshotData = parseSnapshotData(jsonSnapshot.snapshot_data);

        if (snapshotData) {
            const questions = mapSnapshotDataToScoringQuestions(
                snapshotData,
                jsonSnapshot.question_count,
            );

            return questions
                ? {
                      status: 'ready',
                      sessionId: jsonSnapshot.session_id,
                      questions,
                      timedEndsAt: toTimedEndsAtIso(jsonSnapshot.timed_ends_at),
                      snapshotData,
                  }
                : { status: 'invalid_snapshot' };
        }
    }

    const result = await withDirectPgClient((client) => {
        return client.query<SnapshotScoringRow>(
            `
                SELECT
                    s."id" AS "session_id",
                    s."questionCount" AS "question_count",
                    s."timedEndsAt" AS "timed_ends_at",
                    q."id" AS "question_id",
                    q."difficulty"::text AS "difficulty",
                    ao."id" AS "option_id",
                    ao."isCorrect" AS "is_correct"
                FROM "QuizSession" s
                LEFT JOIN "QuizSessionQuestion" ssq
                    ON ssq."sessionId" = s."id"
                LEFT JOIN "Question" q
                    ON q."id" = ssq."questionId"
                LEFT JOIN "QuizSessionQuestionOption" ssqo
                    ON ssqo."sessionQuestionId" = ssq."id"
                LEFT JOIN "AnswerOption" ao
                    ON ao."id" = ssqo."optionId"
                WHERE
                    s."id" = $1
                    AND s."userId" = $2
                    AND s."status" = 'IN_PROGRESS'::"QuizSessionStatus"
                ORDER BY ssq."position" ASC, ssqo."displayOrder" ASC
            `,
            [sessionId, userId],
        );
    });

    if (result.rows.length === 0) {
        return { status: 'not_found' };
    }

    const firstRow = result.rows[0];
    const questions = new Map<string, SessionSnapshotScoringQuestion>();

    for (const row of result.rows) {
        if (
            !row.question_id ||
            !row.difficulty ||
            !row.option_id ||
            row.is_correct === null
        ) {
            return { status: 'invalid_snapshot' };
        }

        const existing = questions.get(row.question_id);

        if (existing) {
            existing.options.push({
                id: row.option_id,
                isCorrect: row.is_correct,
            });
        } else {
            questions.set(row.question_id, {
                id: row.question_id,
                difficulty: row.difficulty,
                options: [{ id: row.option_id, isCorrect: row.is_correct }],
            });
        }
    }

    if (questions.size !== firstRow.question_count) {
        return { status: 'invalid_snapshot' };
    }

    return {
        status: 'ready',
        sessionId: firstRow.session_id,
        questions: Array.from(questions.values()),
        timedEndsAt: toTimedEndsAtIso(firstRow.timed_ends_at),
        snapshotData: null,
    };
}

async function loadCompletedSessionReview(
    sessionId: string,
    userId: string,
    locale: Locale,
): Promise<SessionReviewPayload | null> {
    const loaded = await withDirectPgClient(async (client) => {
        const sessionResult = await client.query<SessionSnapshotJsonRow>(
            `
                SELECT
                    "id" AS "session_id",
                    "questionCount" AS "question_count",
                    "snapshotData" AS "snapshot_data"
                FROM "QuizSession"
                WHERE
                    "id" = $1
                    AND "userId" = $2
                    AND "status" = 'COMPLETED'::"QuizSessionStatus"
                LIMIT 1
            `,
            [sessionId, userId],
        );

        const session = sessionResult.rows[0];

        if (!session) {
            return null;
        }

        const snapshotData = parseSnapshotData(session.snapshot_data);

        if (
            !snapshotData ||
            snapshotData.questions.length !== session.question_count
        ) {
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
            sessionId: session.session_id,
            questionCount: session.question_count,
            snapshotData,
            answers: answersResult.rows.map((row) => ({
                questionId: row.question_id,
                selectedOptionId: row.selected_option_id,
                isCorrect: row.is_correct,
            })),
        };
    });

    if (!loaded) {
        return null;
    }

    let questions = [...loaded.snapshotData.questions]
        .sort((left, right) => left.position - right.position)
        .map((question) => ({
            id: question.id,
            text: pickSnapshotText(question.texts, question.text, locale),
            difficulty: question.difficulty,
            type: question.type,
            imageUrl: normalizeQuizImageUrl(question.imageUrl),
            position: question.position,
            options: [...question.options]
                .sort((left, right) => left.order - right.order)
                .map((option) => ({
                    id: option.id,
                    text: pickSnapshotText(option.texts, option.text, locale),
                    order: option.order,
                    isCorrect: option.isCorrect,
                })),
        }));

    if (!hasBilingualTexts(loaded.snapshotData)) {
        const localized = await loadLocalizedTextsByQuestionIds(
            locale,
            questions.map((question) => question.id),
        );

        questions = questions.map((question) => {
            const overlay = localized.get(question.id);

            if (!overlay) {
                return question;
            }

            return {
                ...question,
                text: overlay.displayText || question.text,
                options: question.options.map((option) => ({
                    ...option,
                    text: overlay.options.get(option.id) || option.text,
                })),
            };
        });
    }

    return {
        sessionId: loaded.sessionId,
        questionCount: loaded.questionCount,
        questions,
        answers: loaded.answers,
    };
}

/**
 * Fallback SELECT snapshotData, если handoff промахнулся (другой инстанс / refresh).
 * Dev 5s — не ждать Windows TOAST-клин 18s×2. Prod 18s — холодный Neon после
 * redirect не должен давать ложный soft-miss. Не глобальный timeout bump.
 */
const PLAY_LOAD_SNAPSHOT_TIMEOUT_MS =
    process.env.NODE_ENV === 'development' ? 5_000 : 18_000;

async function loadSnapshotPublicQuestions(
    sessionId: string,
    userId: string,
    locale: Locale,
): Promise<QuizSessionPublicView | null> {
    const handedOff = takeQuizPlayLoad(sessionId, userId);

    if (handedOff) {
        return handedOff;
    }

    const jsonSnapshot = await loadQuizSessionSnapshotData(
        sessionId,
        userId,
        'quiz.session.load-snapshot',
        PLAY_LOAD_SNAPSHOT_TIMEOUT_MS,
    );

    if (jsonSnapshot) {
        const snapshotData = parseSnapshotData(jsonSnapshot.snapshot_data);

        if (snapshotData) {
            const mapped = mapSnapshotDataToPublicQuestions(
                snapshotData,
                jsonSnapshot.question_count,
                locale,
            );

            if (!mapped) {
                return null;
            }

            const timedEndsAt = toTimedEndsAtIso(jsonSnapshot.timed_ends_at);
            const questions = !hasBilingualTexts(snapshotData)
                ? await overlayPublicQuestionsWithLocale(mapped, locale)
                : mapped;

            return {
                questions,
                timedEndsAt,
                difficulty: jsonSnapshot.difficulty,
            };
        }
    }

    // Legacy Direct JOIN после create TOAST клинит тот же hop (~18s).
    // Play-load только pooled snapshotData; miss → retry 400ms / soft-miss.
    return null;
}

/** Методы reads для thin facade quizSessionRepository. */
export const quizSessionReadsMethods = {
    findInProgressByIdForUser(sessionId: string, userId: string) {
        return withDatabaseRetry(() =>
            prisma.quizSession.findFirst({
                where: {
                    id: sessionId,
                    userId,
                    status: 'IN_PROGRESS',
                },
            }),
        );
    },

    findSnapshotPublicQuestionsForUser(
        sessionId: string,
        userId: string,
        locale: Locale,
    ) {
        return loadSnapshotPublicQuestions(sessionId, userId, locale);
    },

    findSnapshotForScoring(sessionId: string, userId: string) {
        return loadSessionForSubmit(sessionId, userId).then((result) => {
            if (result.status !== 'ready') {
                return null;
            }

            return result.questions;
        });
    },

    findSessionForSubmit(sessionId: string, userId: string) {
        return loadSessionForSubmit(sessionId, userId);
    },

    findReviewForUser(sessionId: string, userId: string, locale: Locale) {
        return loadCompletedSessionReview(sessionId, userId, locale);
    },
};
