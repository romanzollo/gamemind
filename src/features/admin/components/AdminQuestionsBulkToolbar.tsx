'use client';

/**
 * Панель массовых действий списка вопросов: счётчик выбора, «выбрать все /
 * снять», и только применимые переходы (витрина, публикация) → bulk Server
 * Actions без redirect (тост + refresh с сохранением прокрутки).
 */

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
    activateQuestionsBulkAction,
    deactivateQuestionsBulkAction,
    publishQuestionsBulkAction,
    submitQuestionsForReviewBulkAction,
} from '@/features/admin/actions/questions';
import {
    getBulkToolbarCapabilities,
    hasBulkMutationActions,
} from '@/features/admin/lib/bulk-toolbar-capabilities';
import { getAdminErrorMessage } from '@/features/admin/lib/get-admin-error-message';
import { BULK_QUESTION_IDS_FIELD } from '@/features/admin/lib/parse-bulk-question-ids';
import type { Dictionary, Locale } from '@/shared/i18n';
import { SubmitButton } from '@/shared/ui';
import { refreshPreservingScroll } from '@/shared/ui/refresh-preserving-scroll';
import { toastError, toastSuccess } from '@/shared/ui/toast';
import type { AdminBulkActionResult, AdminQuestionListItem } from '../types';

const bulkToolbarLinkClassName =
    'inline-flex min-h-8 cursor-pointer items-center rounded-sm px-0.5 text-sm font-medium text-foreground underline-offset-2 motion-safe:transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline';

const bulkGroupLabelClassName =
    'font-mono text-2xs font-medium uppercase tracking-wide text-muted';

/**
 * Часть словаря для тостов массовых действий — всё, что таблице нужно
 * сверх `labels`. Явная зависимость вместо всего Dictionary.
 */
export type AdminTableDictionary = Pick<Dictionary, 'admin' | 'notifications'>;

function BulkActionForm({
    action,
    locale,
    questionIds,
    disabled,
    pendingLabel,
    className,
    children,
    onSubmit,
    dictionary,
}: {
    action: (formData: FormData) => Promise<AdminBulkActionResult>;
    locale: Locale;
    questionIds: readonly string[];
    disabled: boolean;
    pendingLabel: string;
    className: string;
    children: string;
    onSubmit: () => void;
    dictionary: AdminTableDictionary;
}) {
    const router = useRouter();

    if (questionIds.length === 0) {
        return null;
    }

    async function clientAction(formData: FormData) {
        onSubmit();
        const result = await action(formData);

        if (result.status === 'skipped') {
            return;
        }

        if (result.status === 'error') {
            const message = getAdminErrorMessage(dictionary, result.errorCode);
            toastError(message ?? dictionary.notifications.errorGeneric);
            return;
        }

        toastSuccess(dictionary.notifications[result.notice]);
        refreshPreservingScroll(router);
    }

    return (
        <form
            action={clientAction}
            className="inline-flex"
        >
            <input type="hidden" name="locale" value={locale} />
            {questionIds.map((id) => (
                <input
                    key={id}
                    type="hidden"
                    name={BULK_QUESTION_IDS_FIELD}
                    value={id}
                />
            ))}
            <SubmitButton
                unstyled
                disabled={disabled}
                pendingLabel={pendingLabel}
                className={className}
            >
                {children}
            </SubmitButton>
        </form>
    );
}

/**
 * Contextual bulk toolbar (Scoreboard Editorial).
 *
 * Ряд 1 — selection (счётчик + select all/clear).
 * Ряд 2 — только применимые мутации, двумя группами (витрина | публикация).
 * Уже PUBLISHED → «Опубликовать» скрыта; уже active → «Активировать» скрыта.
 *
 * bulkPending: на время Server Action блокируем только mutation-CTA
 * (не select/clear — иначе после soft-redirect stuck disabled навсегда:
 * Client state переживает revalidate, а pending никто не сбрасывал).
 * Сброс: когда статусы выбранных строк обновились + failsafe timeout.
 */
export function BulkQuestionsToolbar({
    selectedEntries,
    labels,
    dictionary,
    locale,
    workingLabel,
    allVisibleSelected,
    onSelectAll,
    onClear,
}: {
    selectedEntries: readonly AdminQuestionListItem[];
    labels: Dictionary['admin'];
    dictionary: AdminTableDictionary;
    locale: Locale;
    workingLabel: string;
    allVisibleSelected: boolean;
    onSelectAll: () => void;
    onClear: () => void;
}) {
    const [pendingFingerprint, setPendingFingerprint] = useState<
        string | null
    >(null);
    const selectedCount = selectedEntries.length;
    const hasSelection = selectedCount > 0;
    const selectedLabel = labels.bulkSelected.replace(
        '{count}',
        String(selectedCount),
    );
    const capabilities = getBulkToolbarCapabilities(selectedEntries);
    const showMutations = hasBulkMutationActions(capabilities);

    const deactivateIds = selectedEntries
        .filter((entry) => entry.isActive)
        .map((entry) => entry.id);
    const activateIds = selectedEntries
        .filter((entry) => !entry.isActive)
        .map((entry) => entry.id);
    const submitForReviewIds = selectedEntries
        .filter((entry) => entry.publicationStatus === 'DRAFT')
        .map((entry) => entry.id);
    const publishIds = selectedEntries
        .filter(
            (entry) =>
                entry.publicationStatus === 'DRAFT' ||
                entry.publicationStatus === 'IN_REVIEW',
        )
        .map((entry) => entry.id);

    // Отпечаток статусов выбора. Pending = отпечаток не изменился с submit:
    // RSC обновил isActive/status → отпечаток другой → pending снят сам.
    const selectionFingerprint = selectedEntries
        .map(
            (entry) =>
                `${entry.id}:${entry.isActive ? '1' : '0'}:${entry.publicationStatus}`,
        )
        .sort()
        .join('|');
    const bulkPending = pendingFingerprint === selectionFingerprint;

    // Если redirect/error не изменил статусы — не держим UI disabled вечно.
    useEffect(() => {
        if (!bulkPending) {
            return;
        }

        const timer = window.setTimeout(() => {
            setPendingFingerprint(null);
        }, 8_000);

        return () => window.clearTimeout(timer);
    }, [bulkPending]);

    const markPending = () => setPendingFingerprint(selectionFingerprint);

    function handleClear() {
        setPendingFingerprint(null);
        onClear();
    }

    return (
        <div
            className="mb-4 space-y-2 border-b border-border pb-3"
            aria-busy={bulkPending}
        >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono text-sm tabular-nums text-muted">
                    {selectedLabel}
                </span>

                <span
                    className="hidden h-4 w-px bg-border sm:block"
                    aria-hidden
                />

                <button
                    type="button"
                    className={bulkToolbarLinkClassName}
                    onClick={onSelectAll}
                    disabled={allVisibleSelected}
                >
                    {labels.bulkSelectAll}
                </button>

                <button
                    type="button"
                    className={bulkToolbarLinkClassName}
                    onClick={handleClear}
                    disabled={!hasSelection}
                >
                    {labels.bulkClearSelection}
                </button>
            </div>

            {hasSelection ? (
                showMutations ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-2">
                        {capabilities.canDeactivate ||
                        capabilities.canActivate ? (
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <span className={bulkGroupLabelClassName}>
                                    {labels.bulkGroupVisibility}
                                </span>
                                <BulkActionForm
                                    action={deactivateQuestionsBulkAction}
                                    locale={locale}
                                    questionIds={deactivateIds}
                                    disabled={bulkPending}
                                    pendingLabel={workingLabel}
                                    className={`${bulkToolbarLinkClassName} text-warning`}
                                    onSubmit={markPending}
                                    dictionary={dictionary}
                                >
                                    {labels.bulkDeactivateButton}
                                </BulkActionForm>
                                <BulkActionForm
                                    action={activateQuestionsBulkAction}
                                    locale={locale}
                                    questionIds={activateIds}
                                    disabled={bulkPending}
                                    pendingLabel={workingLabel}
                                    className={`${bulkToolbarLinkClassName} text-success`}
                                    onSubmit={markPending}
                                    dictionary={dictionary}
                                >
                                    {labels.bulkActivateButton}
                                </BulkActionForm>
                            </div>
                        ) : null}

                        {capabilities.canSubmitForReview ||
                        capabilities.canPublish ? (
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <span className={bulkGroupLabelClassName}>
                                    {labels.bulkGroupPublication}
                                </span>
                                <BulkActionForm
                                    action={
                                        submitQuestionsForReviewBulkAction
                                    }
                                    locale={locale}
                                    questionIds={submitForReviewIds}
                                    disabled={bulkPending}
                                    pendingLabel={workingLabel}
                                    className={`${bulkToolbarLinkClassName} text-warning`}
                                    onSubmit={markPending}
                                    dictionary={dictionary}
                                >
                                    {labels.bulkSubmitForReviewButton}
                                </BulkActionForm>
                                <BulkActionForm
                                    action={publishQuestionsBulkAction}
                                    locale={locale}
                                    questionIds={publishIds}
                                    disabled={bulkPending}
                                    pendingLabel={workingLabel}
                                    className={`${bulkToolbarLinkClassName} text-success`}
                                    onSubmit={markPending}
                                    dictionary={dictionary}
                                >
                                    {labels.bulkPublishButton}
                                </BulkActionForm>
                            </div>
                        ) : null}
                    </div>
                ) : (
                    <p className="text-sm text-muted">
                        {labels.bulkNoActionsForSelection}
                    </p>
                )
            ) : null}
        </div>
    );
}
