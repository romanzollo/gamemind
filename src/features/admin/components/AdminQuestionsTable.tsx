'use client';

import { useEffect, useRef, useState } from 'react';

import { AdminQuestionListBackContext } from '@/features/admin/components/AdminQuestionActionFields';
import {
    BulkQuestionsToolbar,
    type AdminTableDictionary,
} from '@/features/admin/components/AdminQuestionsBulkToolbar';
import {
    CardHeroImage,
    CorrectAnswerLine,
    DifficultyChip,
    ListCardBadges,
    ListCardMeta,
    MissingPromptThumb,
    PromptThumb,
    QuestionRowActions,
    RowSelectCheckbox,
    StatusPublicationCell,
    checkboxClassName,
} from '@/features/admin/components/AdminQuestionRowParts';
import type { Dictionary, Locale } from '@/shared/i18n';
import { EmptyState } from '@/shared/ui';
import type { AdminQuestionListItem } from '../types';

export type { AdminTableDictionary };


/**
 * Список вопросов admin: Scoreboard Editorial.
 *
 * Mobile/tablet: отдельные surface-блоки; IMAGE — full-bleed hero сверху
 * (16:9), текст и actions ниже. Desktop: таблица + difficulty chip.
 * Превью — ужатые копии через AdminPromptImage, не исходники 1280×720.
 *
 * Две оси статуса: isActive (витрина) и publicationStatus (редактура).
 * Кнопки публикации только для разрешённых переходов (см. DECISIONS).
 *
 * Desktop actions density: снаружи только Edit (одинаково во всех строках);
 * publication / activate / deactivate / delete — в «Ещё».
 * В меню «вперёд»-шаги взаимоисключающие: DRAFT → На ревью; IN_REVIEW → Опубликовать
 * (как Активировать ↔ Деактивировать). Прямой publish с DRAFT — на edit-панели.
 *
 * Bulk toolbar: Client selection + contextual CTA (только применимые переходы)
 * → Server Actions (isActive + publication). Single-row actions сохраняем.
 */

type AdminQuestionsTableProps = {
    entries: AdminQuestionListItem[];
    labels: Dictionary['admin'];
    /** Нужен для bulk toast / error copy без redirect. */
    dictionary: AdminTableDictionary;
    locale: Locale;
    /** common.working — pendingLabel для Server Action кнопок списка */
    workingLabel: string;
    emptyTitle?: string;
    /**
     * Нормализованный query текущего списка (фильтры + страница): правка и
     * ошибки действий возвращают сюда же, а не на первую страницу.
     */
    listBack: string;
};

export function AdminQuestionsTable({
    entries,
    labels,
    dictionary,
    locale,
    workingLabel,
    emptyTitle,
    listBack,
}: AdminQuestionsTableProps) {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(
        () => new Set(),
    );
    const selectAllRef = useRef<HTMLInputElement>(null);

    const visibleIds = entries.map((entry) => entry.id);
    const allVisibleSelected =
        entries.length > 0 &&
        entries.every((entry) => selectedIds.has(entry.id));
    const someVisibleSelected =
        !allVisibleSelected &&
        entries.some((entry) => selectedIds.has(entry.id));

    // После смены фильтра URL / RSC refresh: убрать id, которых больше нет
    // в списке. Сравнение с прошлым `entries` прямо в render (паттерн React
    // «adjusting state when a prop changes») — без лишнего effect-прохода.
    const [prunedForEntries, setPrunedForEntries] = useState(entries);
    if (prunedForEntries !== entries) {
        setPrunedForEntries(entries);
        const visible = new Set(visibleIds);
        setSelectedIds((prev) => {
            let changed = false;
            const next = new Set<string>();
            for (const id of prev) {
                if (visible.has(id)) {
                    next.add(id);
                } else {
                    changed = true;
                }
            }
            return changed ? next : prev;
        });
    }

    useEffect(() => {
        if (selectAllRef.current) {
            selectAllRef.current.indeterminate = someVisibleSelected;
        }
    }, [someVisibleSelected]);

    function toggleId(id: string) {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }

    function selectAllVisible() {
        setSelectedIds(new Set(visibleIds));
    }

    function clearSelection() {
        setSelectedIds(new Set());
    }

    function toggleSelectAllVisible() {
        if (allVisibleSelected) {
            clearSelection();
        } else {
            selectAllVisible();
        }
    }

    if (entries.length === 0) {
        return (
            <EmptyState
                className="mt-6"
                title={emptyTitle ?? labels.empty}
            />
        );
    }

    const selectedEntries = entries.filter((entry) =>
        selectedIds.has(entry.id),
    );

    return (
        <AdminQuestionListBackContext value={listBack}>
        <div className="mt-6">
            <BulkQuestionsToolbar
                selectedEntries={selectedEntries}
                labels={labels}
                dictionary={dictionary}
                locale={locale}
                workingLabel={workingLabel}
                allVisibleSelected={allVisibleSelected}
                onSelectAll={selectAllVisible}
                onClear={clearSelection}
            />

            <ul className="space-y-3 lg:hidden">
                {entries.map((entry) => {
                    const isImage = entry.type === 'IMAGE_GUESS';
                    const typeLabel = isImage
                        ? labels.formQuestionTypeImageGuess
                        : labels.formQuestionTypeText;
                    const isSelected = selectedIds.has(entry.id);

                    return (
                        <li
                            key={entry.id}
                            className={
                                isImage
                                    ? 'overflow-hidden rounded-lg border border-border bg-surface'
                                    : 'rounded-lg border border-border bg-surface px-3.5 py-3'
                            }
                        >
                            {isImage ? (
                                <>
                                    <CardHeroImage
                                        url={entry.promptImageUrl}
                                        alt={entry.text}
                                        emptyLabel={typeLabel}
                                    />
                                    <div className="flex flex-col gap-2 px-3.5 py-3">
                                        <div className="flex items-start gap-3">
                                            <RowSelectCheckbox
                                                id={entry.id}
                                                checked={isSelected}
                                                label={labels.bulkSelectRow}
                                                onToggle={toggleId}
                                            />
                                            <div className="min-w-0 flex-1">
                                                <ListCardBadges
                                                    entry={entry}
                                                    labels={labels}
                                                    showTypeLabel
                                                    typeLabel={typeLabel}
                                                />
                                                <p className="mt-1.5 line-clamp-2 text-sm font-medium leading-snug text-foreground">
                                                    {entry.text}
                                                </p>
                                                <CorrectAnswerLine
                                                    answer={entry.correctAnswer}
                                                    label={
                                                        labels.listCorrectAnswer
                                                    }
                                                />
                                                <ListCardMeta
                                                    entry={entry}
                                                    locale={locale}
                                                />
                                            </div>
                                        </div>
                                        <QuestionRowActions
                                            entry={entry}
                                            labels={labels}
                                            locale={locale}
                                            workingLabel={workingLabel}
                                        />
                                    </div>
                                </>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-start gap-3">
                                        <RowSelectCheckbox
                                            id={entry.id}
                                            checked={isSelected}
                                            label={labels.bulkSelectRow}
                                            onToggle={toggleId}
                                        />
                                        <div className="min-w-0 flex-1">
                                            <ListCardBadges
                                                entry={entry}
                                                labels={labels}
                                                showTypeLabel={false}
                                                typeLabel={typeLabel}
                                            />
                                            <p className="mt-1 line-clamp-2 text-sm font-medium leading-snug text-foreground">
                                                {entry.text}
                                            </p>
                                            <ListCardMeta
                                                entry={entry}
                                                locale={locale}
                                            />
                                        </div>
                                    </div>
                                    <QuestionRowActions
                                        entry={entry}
                                        labels={labels}
                                        locale={locale}
                                        workingLabel={workingLabel}
                                    />
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>

            <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface lg:block">
                {/*
                  Desktop queue row: select + вопрос + мета, состояние, дата, actions.
                  Меньше колонок = стабильнее RU/EN и ближе к реальным CMS/admin.
                */}
                <table className="w-full min-w-3xl border-collapse text-left text-sm">
                    <thead>
                        <tr className="border-b border-border bg-surface-muted text-muted">
                            <th className="w-10 px-3 py-2.5">
                                <input
                                    ref={selectAllRef}
                                    type="checkbox"
                                    className={checkboxClassName}
                                    checked={allVisibleSelected}
                                    aria-label={labels.bulkSelectAll}
                                    onChange={toggleSelectAllVisible}
                                />
                            </th>
                            <th className="w-[52%] px-4 py-2.5 font-medium">
                                {labels.tableQuestion}
                            </th>
                            <th className="w-32 whitespace-nowrap px-3 py-2.5 font-medium">
                                {labels.tableStatus}
                            </th>
                            <th className="w-28 whitespace-nowrap px-3 py-2.5 font-medium">
                                {labels.tableCreated}
                            </th>
                            <th className="w-48 px-4 py-2.5 font-medium">
                                {labels.tableActions}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {entries.map((entry) => {
                            const isImage = entry.type === 'IMAGE_GUESS';
                            const typeLabel = isImage
                                ? labels.formQuestionTypeImageGuess
                                : labels.formQuestionTypeText;
                            const isSelected = selectedIds.has(entry.id);

                            return (
                                <tr
                                    key={entry.id}
                                    className="group border-b border-border last:border-b-0 hover:bg-surface-hover/40"
                                >
                                    <td className="px-3 py-3 align-top">
                                        <RowSelectCheckbox
                                            id={entry.id}
                                            checked={isSelected}
                                            label={labels.bulkSelectRow}
                                            onToggle={toggleId}
                                        />
                                    </td>
                                    <td className="min-w-0 px-4 py-3 text-foreground">
                                        <div className="flex items-start gap-3">
                                            {isImage ? (
                                                entry.promptImageUrl ? (
                                                    <PromptThumb
                                                        url={
                                                            entry.promptImageUrl
                                                        }
                                                        alt={entry.text}
                                                    />
                                                ) : (
                                                    <MissingPromptThumb
                                                        label={typeLabel}
                                                    />
                                                )
                                            ) : (
                                                <span
                                                    className="mt-0.5 shrink-0 rounded-sm bg-surface-muted px-1.5 py-0.5 font-mono text-2xs font-medium tracking-wide text-muted"
                                                    title={typeLabel}
                                                >
                                                    TEXT
                                                </span>
                                            )}
                                            <div className="min-w-0">
                                                <span className="line-clamp-2 text-sm font-medium leading-snug">
                                                    {entry.text}
                                                </span>
                                                <CorrectAnswerLine
                                                    answer={entry.correctAnswer}
                                                    label={
                                                        labels.listCorrectAnswer
                                                    }
                                                />
                                                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                                                    <DifficultyChip
                                                        difficulty={
                                                            entry.difficulty
                                                        }
                                                    />
                                                    <span>
                                                        {entry.category}
                                                    </span>
                                                    {isImage ? (
                                                        <span>{typeLabel}</span>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-3 py-3 align-top">
                                        <StatusPublicationCell
                                            entry={entry}
                                            labels={labels}
                                        />
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-3 font-mono text-sm tabular-nums text-muted">
                                        {new Date(
                                            entry.createdAt,
                                        ).toLocaleDateString(locale)}
                                    </td>
                                    <td className="px-4 py-3 align-top">
                                        <QuestionRowActions
                                            entry={entry}
                                            labels={labels}
                                            locale={locale}
                                            workingLabel={workingLabel}
                                        />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
        </AdminQuestionListBackContext>
    );
}
