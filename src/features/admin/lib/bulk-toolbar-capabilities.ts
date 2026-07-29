/**
 * Какие bulk-кнопки показывать для текущего выбора на /admin/questions.
 *
 * Зачем: две оси статуса (isActive и publicationStatus) ортогональны.
 * Показывать «Опубликовать» для уже PUBLISHED — шум и ложное ожидание
 * (сервер no-op, но UI врёт). Как у single-row: CTA только если переход
 * реально возможен хотя бы для одного выбранного.
 *
 * Pure: без React / Neon — удобно юнит-тестировать.
 * См. DECISIONS → Question publication workflow + Bulk isActive.
 */

import type { QuestionPublicationStatus } from '@/types';

/** Минимальный снимок строки списка для расчёта toolbar. */
export type BulkToolbarEntry = {
    isActive: boolean;
    publicationStatus: QuestionPublicationStatus;
};

export type BulkToolbarCapabilities = {
    /** Есть хотя бы один active → можно soft-hide. */
    canDeactivate: boolean;
    /** Есть хотя бы один inactive → можно вернуть в витрину. */
    canActivate: boolean;
    /** Есть DRAFT → можно отправить на ревью. */
    canSubmitForReview: boolean;
    /** Есть DRAFT или IN_REVIEW → можно опубликовать. */
    canPublish: boolean;
};

/**
 * По выбранным строкам — какие mutation-CTA уместны.
 * Пустой выбор → всё false (selection-controls живут отдельно).
 */
export function getBulkToolbarCapabilities(
    selected: readonly BulkToolbarEntry[],
): BulkToolbarCapabilities {
    let canDeactivate = false;
    let canActivate = false;
    let canSubmitForReview = false;
    let canPublish = false;

    for (const entry of selected) {
        if (entry.isActive) {
            canDeactivate = true;
        } else {
            canActivate = true;
        }

        if (entry.publicationStatus === 'DRAFT') {
            canSubmitForReview = true;
            canPublish = true;
        } else if (entry.publicationStatus === 'IN_REVIEW') {
            canPublish = true;
        }
    }

    return {
        canDeactivate,
        canActivate,
        canSubmitForReview,
        canPublish,
    };
}

/** Есть ли хотя бы одна mutation-кнопка (не select all/clear). */
export function hasBulkMutationActions(
    capabilities: BulkToolbarCapabilities,
): boolean {
    return (
        capabilities.canDeactivate ||
        capabilities.canActivate ||
        capabilities.canSubmitForReview ||
        capabilities.canPublish
    );
}
