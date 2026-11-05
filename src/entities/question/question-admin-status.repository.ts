/**
 * Статусы вопросов админки: витрина (isActive) и жизненный цикл
 * publicationStatus — одиночные и массовые переходы с проверкой
 * разрешённых переходов; после записи патчит/сбрасывает кэш списка.
 * Вызывается через фасад question-admin.repository.ts.
 */


import { normalizeBulkQuestionIds } from '@/features/admin/lib/parse-bulk-question-ids';

import type { QuestionPublicationStatus } from '@/types';
import { withDirectPgWriteRetry } from '@/lib/db/direct-pg';
import type {
    BulkIsActiveMutationResult,
    BulkPublicationMutationResult,
    PublicationStatusMutationResult,
} from '@/entities/question/question.types';

import {
    invalidateAdminListCaches,
    patchAdminListCacheQuestion,
    toPublicationStatus,
} from '@/entities/question/question-admin-list.repository';

/**
 * Разрешённые переходы publicationStatus.
 * DRAFT → PUBLISHED напрямую: solo-admin может пропустить ревью.
 * PUBLISHED → только обратно в DRAFT (снять с pool).
 */
const PUBLICATION_TRANSITIONS: Record<
    QuestionPublicationStatus,
    readonly QuestionPublicationStatus[]
> = {
    DRAFT: ['IN_REVIEW', 'PUBLISHED'],
    IN_REVIEW: ['PUBLISHED', 'DRAFT'],
    PUBLISHED: ['DRAFT'],
};

/**
 * Смена publicationStatus с проверкой переходов.
 * Не через Prisma: тот же direct pg write path, что deactivate/activate.
 */
async function setPublicationStatusByIdWithDirectPg(
    id: string,
    target: QuestionPublicationStatus,
): Promise<PublicationStatusMutationResult> {
    return withDirectPgWriteRetry(async (client) => {
        const current = await client.query<{
            publicationStatus: string;
        }>(
            `SELECT "publicationStatus"::text AS "publicationStatus"
             FROM "Question" WHERE "id" = $1`,
            [id],
        );
        const question = current.rows[0];

        if (!question) {
            return { status: 'not_found' };
        }

        const from = toPublicationStatus(question.publicationStatus);

        if (from === target) {
            return { status: 'already_in_target_state' };
        }

        if (!PUBLICATION_TRANSITIONS[from].includes(target)) {
            return { status: 'invalid_transition', from, to: target };
        }

        await client.query(
            `UPDATE "Question"
             SET "publicationStatus" = $2::"QuestionPublicationStatus",
                 "updatedAt" = NOW()
             WHERE "id" = $1`,
            [id, target],
        );

        return { status: 'updated' };
    });
}

export async function mutatePublicationStatusById(
    id: string,
    target: QuestionPublicationStatus,
): Promise<PublicationStatusMutationResult> {
    const result = await setPublicationStatusByIdWithDirectPg(id, target);

    if (
        result.status === 'updated' ||
        result.status === 'already_in_target_state'
    ) {
        // Не полный invalidate: redirect на list должен попасть в cache hit.
        patchAdminListCacheQuestion(id, { publicationStatus: target });
    }

    return result;
}

/**
 * Один UPDATE для многих id: только строки, где isActive ещё не target.
 * Autocommit (без BEGIN/COMMIT) — см. Neon write path в DECISIONS.md.
 * После успеха — полный invalidate list-cache (много строк + фильтр status).
 * Нормализация id — shared pure lib (parse-bulk-question-ids).
 */
export async function setManyIsActiveByIds(
    ids: readonly string[],
    isActive: boolean,
): Promise<BulkIsActiveMutationResult> {
    const normalized = normalizeBulkQuestionIds(ids);

    if (normalized.length === 0) {
        return { requestedCount: 0, updatedCount: 0 };
    }

    const result = await withDirectPgWriteRetry(async (client) => {
        // cuid id → text[]; AND isActive <> target = idempotent no-op для уже готовых.
        const updated = await client.query<{ id: string }>(
            `UPDATE "Question"
             SET "isActive" = $1
             WHERE "id" = ANY($2::text[])
               AND "isActive" = $3
             RETURNING "id"`,
            [isActive, normalized, !isActive],
        );

        return {
            requestedCount: normalized.length,
            updatedCount: updated.rowCount ?? updated.rows.length,
        } satisfies BulkIsActiveMutationResult;
    });

    if (result.updatedCount > 0) {
        invalidateAdminListCaches();
    }

    return result;
}

/**
 * Bulk-смена publicationStatus: один UPDATE, без цикла Prisma/$transaction.
 *
 * fromStatuses — allowlist «откуда можно» (как PUBLICATION_TRANSITIONS).
 * Уже target / другой статус / нет строки → не входят в updatedCount.
 * Autocommit; полный invalidate list-cache при updatedCount > 0
 * (как bulk isActive: фильтр publication на list может скрыть строки).
 * Quality gate сюда не кладём — только SQL-переход.
 */
export async function setManyPublicationStatusByIds(
    ids: readonly string[],
    target: QuestionPublicationStatus,
    fromStatuses: readonly QuestionPublicationStatus[],
): Promise<BulkPublicationMutationResult> {
    const normalized = normalizeBulkQuestionIds(ids);

    if (normalized.length === 0 || fromStatuses.length === 0) {
        return { requestedCount: normalized.length, updatedCount: 0 };
    }

    // Inline enum literals (не $n для enum[]) — тот же стиль, что admin list WHERE.
    const fromSql = fromStatuses
        .map((status) => `'${status}'::"QuestionPublicationStatus"`)
        .join(', ');

    const result = await withDirectPgWriteRetry(async (client) => {
        const updated = await client.query<{ id: string }>(
            `UPDATE "Question"
             SET "publicationStatus" = '${target}'::"QuestionPublicationStatus"
             WHERE "id" = ANY($1::text[])
               AND "publicationStatus" IN (${fromSql})
             RETURNING "id"`,
            [normalized],
        );

        return {
            requestedCount: normalized.length,
            updatedCount: updated.rowCount ?? updated.rows.length,
        } satisfies BulkPublicationMutationResult;
    });

    if (result.updatedCount > 0) {
        invalidateAdminListCaches();
    }

    return result;
}

// деактивация вопроса по id (admin deactivate flow)
export async function deactivateQuestionById(id: string) {
    const result = await withDirectPgWriteRetry(async (client) => {
        const current = await client.query<{ isActive: boolean }>(
            `SELECT "isActive" FROM "Question" WHERE "id" = $1`,
            [id],
        );
        const question = current.rows[0];

        if (!question) {
            return { status: 'not_found' } as const;
        }

        if (!question.isActive) {
            return { status: 'already_in_target_state' } as const;
        }

        await client.query(
            `UPDATE "Question" SET "isActive" = false WHERE "id" = $1`,
            [id],
        );

        return { status: 'updated' } as const;
    });

    if (
        result.status === 'updated' ||
        result.status === 'already_in_target_state'
    ) {
        patchAdminListCacheQuestion(id, { isActive: false });
    }

    return result;
}

// активация вопроса по id (admin activate flow)
export async function activateQuestionById(id: string) {
    const result = await withDirectPgWriteRetry(async (client) => {
        const current = await client.query<{ isActive: boolean }>(
            `SELECT "isActive" FROM "Question" WHERE "id" = $1`,
            [id],
        );
        const question = current.rows[0];

        if (!question) {
            return { status: 'not_found' } as const;
        }

        if (question.isActive) {
            return { status: 'already_in_target_state' } as const;
        }

        await client.query(
            `UPDATE "Question" SET "isActive" = true WHERE "id" = $1`,
            [id],
        );

        return { status: 'updated' } as const;
    });

    if (
        result.status === 'updated' ||
        result.status === 'already_in_target_state'
    ) {
        patchAdminListCacheQuestion(id, { isActive: true });
    }

    return result;
}
