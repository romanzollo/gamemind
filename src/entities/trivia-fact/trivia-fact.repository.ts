/**
 * Чтение фактов «А ты знал?» для партии. Только чтение: пишут факты
 * скрипты `facts:*` (scripts/trivia-facts.ts).
 *
 * Оба запроса — короткий pooled SELECT вне Direct-очереди и вне горячего
 * пути: плашка просит факт уже после фиксации ответа, разбор — после сдачи.
 * Сбой здесь никогда не ломает игру: вызывающие ловят ошибку и показывают
 * экран без факта.
 *
 * Безопасность: факт об игре выдаёт ответ на «из какой игры кадр?», поэтому
 * факт к вопросу отдаём только если ответ на него уже записан в этой партии
 * этого игрока (JOIN на QuizAnswer + QuizSession.userId).
 *
 * Canon: docs/DECISIONS.md → Did you know: trivia facts.
 */

import type {
    TriviaFactCandidate,
    TriviaFactFacet,
} from '@/features/quiz/lib/pick-trivia-fact';
import { withPooledPgClient } from '@/lib/db/direct-pg';

/** Факт — бонус: дольше ждать не стоит, игрок уже читает вердикт. */
const FACT_HOP_TIMEOUT_MS = 4_000;

type FactRow = {
    questionId: string;
    key: string;
    facet: string;
    textRu: string;
    textEn: string;
    sourceUrl: string;
};

const FACT_COLUMNS = `
    f."contentKey" AS key, fa."slug" AS facet,
    f."textRu" AS "textRu", f."textEn" AS "textEn", f."sourceUrl" AS "sourceUrl"`;

/** Метка → факт; только опубликованные и только измерения игры / серии. */
const FACT_JOINS = `
    JOIN "TriviaFact" f ON f."tagId" = qt."tagId" AND f."publishedAt" IS NOT NULL
    JOIN "Tag" t ON t."id" = f."tagId"
    JOIN "Facet" fa ON fa."id" = t."facetId" AND fa."slug" IN ('game', 'franchise')`;

function isFacet(value: string): value is TriviaFactFacet {
    return value === 'game' || value === 'franchise';
}

function toCandidate(row: FactRow): TriviaFactCandidate | null {
    return isFacet(row.facet)
        ? {
              key: row.key,
              facet: row.facet,
              textRu: row.textRu,
              textEn: row.textEn,
              sourceUrl: row.sourceUrl,
          }
        : null;
}

export const triviaFactRepository = {
    /**
     * Кандидаты к вопросу, на который игрок уже ответил в этой партии.
     * Ответа нет (или партия чужая) → пустой список.
     */
    async findCandidatesForLockedAnswer(input: {
        sessionId: string;
        userId: string;
        questionId: string;
    }): Promise<TriviaFactCandidate[]> {
        const result = await withPooledPgClient(
            (client) =>
                client.query<FactRow>(
                    `
                        SELECT a."questionId" AS "questionId", ${FACT_COLUMNS}
                        FROM "QuizAnswer" a
                        JOIN "QuizSession" s
                          ON s."id" = a."sessionId" AND s."userId" = $3
                        JOIN "QuestionTag" qt ON qt."questionId" = a."questionId"
                        ${FACT_JOINS}
                        WHERE a."sessionId" = $1 AND a."questionId" = $2
                    `,
                    [input.sessionId, input.questionId, input.userId],
                ),
            {
                debugLabel: 'quiz.fact.after-answer',
                attemptTimeoutMs: FACT_HOP_TIMEOUT_MS,
            },
        );
        return result.rows.flatMap((row) => toCandidate(row) ?? []);
    },

    /**
     * Кандидаты к вопросам разбора. Владение партией уже проверил маршрут
     * разбора; вопросы в разборе — после сдачи, ответ знают все.
     */
    async findCandidatesByQuestionIds(
        questionIds: readonly string[],
    ): Promise<Map<string, TriviaFactCandidate[]>> {
        const byQuestion = new Map<string, TriviaFactCandidate[]>();
        if (questionIds.length === 0) {
            return byQuestion;
        }
        const result = await withPooledPgClient(
            (client) =>
                client.query<FactRow>(
                    `
                        SELECT qt."questionId" AS "questionId", ${FACT_COLUMNS}
                        FROM "QuestionTag" qt
                        ${FACT_JOINS}
                        WHERE qt."questionId" = ANY($1::text[])
                    `,
                    [questionIds],
                ),
            {
                debugLabel: 'quiz.result.trivia-facts',
                attemptTimeoutMs: FACT_HOP_TIMEOUT_MS,
            },
        );
        for (const row of result.rows) {
            const candidate = toCandidate(row);
            if (!candidate) continue;
            const list = byQuestion.get(row.questionId) ?? [];
            list.push(candidate);
            byQuestion.set(row.questionId, list);
        }
        return byQuestion;
    },
};
