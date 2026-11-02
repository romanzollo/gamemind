/**
 * Метки таксономии вопроса для админки: чтение каталога меток, метки
 * вопроса, добавление и снятие одной связи.
 *
 * Справочники (Domain / Facet / Tag) пишет только `taxonomy:sync` из
 * content/taxonomy; здесь — лишь связи QuestionTag. Метку, которую даёт
 * каталог, следующая синхронизация вернёт (DECISIONS → Content taxonomy).
 * Горячий путь квиза эти таблицы не читает. Только сервер.
 */

import { invalidateAdminListCaches } from '@/entities/question/question-admin.repository';
import { withDirectPgClient, withDirectPgWriteRetry } from '@/lib/db/direct-pg';

export type AdminTagOption = {
    id: string;
    facetSlug: string;
    facetNameRu: string;
    facetNameEn: string;
    nameRu: string;
    nameEn: string;
    /** id семейства (PS2 → PlayStation), иначе null. */
    parentId: string | null;
};

export type AdminTagMutationResult =
    { ok: true } | { ok: false; reason: 'UNKNOWN_TAG' | 'NOT_FOUND' };

const TAG_OPTION_SELECT = `
    SELECT
        t."id",
        f."slug" AS "facetSlug",
        f."nameRu" AS "facetNameRu",
        f."nameEn" AS "facetNameEn",
        t."nameRu",
        t."nameEn",
        t."parentId"
    FROM "Tag" t
    JOIN "Facet" f ON f."id" = t."facetId"
`;

export const questionTagsRepository = {
    /** Все метки: для поиска на странице вопроса и фильтра списка (~420 строк). */
    async findAllTagOptions(): Promise<AdminTagOption[]> {
        const result = await withDirectPgClient((client) =>
            client.query<AdminTagOption>(
                `${TAG_OPTION_SELECT} ORDER BY f."sortOrder", t."sortOrder", t."id"`,
            ),
        );
        return result.rows;
    },

    async findTagsForQuestion(questionId: string): Promise<AdminTagOption[]> {
        const result = await withDirectPgClient((client) =>
            client.query<AdminTagOption>(
                `${TAG_OPTION_SELECT}
                JOIN "QuestionTag" qt ON qt."tagId" = t."id"
                WHERE qt."questionId" = $1
                ORDER BY f."sortOrder", t."sortOrder", t."id"`,
                [questionId],
            ),
        );
        return result.rows;
    },

    /** Идемпотентно: повторное добавление той же метки — не ошибка. */
    async addTag(
        questionId: string,
        tagId: string,
    ): Promise<AdminTagMutationResult> {
        const result = await withDirectPgWriteRetry(async (client) => {
            const tag = await client.query(
                `SELECT 1 FROM "Tag" WHERE "id" = $1`,
                [tagId],
            );
            if (tag.rowCount === 0) {
                return { ok: false, reason: 'UNKNOWN_TAG' } as const;
            }
            const question = await client.query(
                `SELECT 1 FROM "Question" WHERE "id" = $1`,
                [questionId],
            );
            if (question.rowCount === 0) {
                return { ok: false, reason: 'NOT_FOUND' } as const;
            }
            await client.query(
                `INSERT INTO "QuestionTag" ("questionId", "tagId")
                 VALUES ($1, $2)
                 ON CONFLICT DO NOTHING`,
                [questionId, tagId],
            );
            return { ok: true } as const;
        });
        invalidateAdminListCaches();
        return result;
    },

    /** Идемпотентно: снятие отсутствующей связи — не ошибка. */
    async removeTag(questionId: string, tagId: string): Promise<void> {
        await withDirectPgWriteRetry((client) =>
            client.query(
                `DELETE FROM "QuestionTag"
                 WHERE "questionId" = $1 AND "tagId" = $2`,
                [questionId, tagId],
            ),
        );
        invalidateAdminListCaches();
    },
};
