/**
 * Доступность тем игры для шторки режима: сколько опубликованных вопросов у
 * каждой темы (с детьми семейства) на каждой сложности.
 *
 * Только для `GET /api/quiz/topics` (ответ кэширует CDN). Не звать из рендера
 * главной и из старта квиза: pick проверяет порог сам, в своём cycle hop.
 * Pooled raw `pg`, вне Direct quiz queue.
 *
 * Canon: docs/DECISIONS.md → Play topics.
 */

import {
    toPlayTopicOptions,
    type PlayTopicCountRow,
    type PlayTopicOption,
} from '@/entities/play-topic/play-topic';
import { withPooledPgClient } from '@/lib/db/direct-pg';

const PLAY_TOPICS_ATTEMPT_MS = 8_000;

export const playTopicRepository = {
    async findPlayTopicOptions(): Promise<PlayTopicOption[]> {
        const result = await withPooledPgClient(
            (client) =>
                client.query<PlayTopicCountRow>(`
                    SELECT
                        topic."id",
                        topic."nameRu",
                        topic."nameEn",
                        COUNT(DISTINCT q."id") FILTER (WHERE q."difficulty" = 'EASY')::int AS "easy",
                        COUNT(DISTINCT q."id") FILTER (WHERE q."difficulty" = 'MEDIUM')::int AS "medium",
                        COUNT(DISTINCT q."id") FILTER (WHERE q."difficulty" = 'HARD')::int AS "hard"
                    FROM "Tag" topic
                    LEFT JOIN "Tag" member
                        ON member."id" = topic."id" OR member."parentId" = topic."id"
                    LEFT JOIN "QuestionTag" qt
                        ON qt."tagId" = member."id"
                    LEFT JOIN "Question" q
                        ON q."id" = qt."questionId"
                        AND q."isActive" = true
                        AND q."publicationStatus" = 'PUBLISHED'::"QuestionPublicationStatus"
                    WHERE topic."playOrder" IS NOT NULL
                    GROUP BY topic."id", topic."nameRu", topic."nameEn", topic."playOrder"
                    ORDER BY topic."playOrder"
                `),
            {
                debugLabel: 'quiz.topics.options',
                attemptTimeoutMs: PLAY_TOPICS_ATTEMPT_MS,
            },
        );

        return toPlayTopicOptions(result.rows);
    },
};
