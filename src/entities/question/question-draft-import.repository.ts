/**
 * Чтение для импорта черновиков: какие вопросы уже есть в целевой БД.
 *
 * Только CLI `content:import-drafts` (через `importDraftQuestionsBatch`),
 * не горячий путь и не админка. Один SELECT без TOAST-колонок: все TEXT
 * (~1000 строк, сотни КБ) плюс строки с ключами партии любого типа —
 * текст сравнивается в JS после нормализации, в SQL её не повторить.
 * Чтение через Direct с повторами: сеть владельца рвёт соединение с Neon.
 *
 * Canon: docs/DECISIONS.md → Draft import is re-runnable.
 */

import { withDirectPgClient } from '@/lib/db/direct-pg';

export type DraftImportExistingRow = {
    id: string;
    contentKey: string | null;
    ruText: string | null;
};

export async function findQuestionsForDraftImport(
    contentKeys: readonly string[],
): Promise<DraftImportExistingRow[]> {
    const result = await withDirectPgClient(
        (client) =>
            client.query<DraftImportExistingRow>(
                `
                SELECT
                    q."id",
                    q."contentKey",
                    t."text" AS "ruText"
                FROM "Question" q
                LEFT JOIN "QuestionTranslation" t
                    ON t."questionId" = q."id" AND t."locale" = 'ru'
                WHERE q."type" = 'TEXT'::"QuestionType"
                   OR q."contentKey" = ANY($1::text[])
                `,
                [[...contentKeys]],
            ),
        { debugLabel: 'draft-import-existing' },
    );
    return result.rows;
}
