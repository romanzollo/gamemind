import Link from 'next/link';

import {
    activateQuestionAction,
    deactivateQuestionAction,
    deleteQuestionAction,
} from '@/features/admin/actions/questions';
import type { Dictionary, Locale } from '@/shared/i18n';
import { EmptyState, SubmitButton } from '@/shared/ui';
import type { Difficulty } from '@/types';
import type { AdminQuestionListItem } from '../types';

/**
 * Список вопросов admin: Scoreboard Editorial.
 *
 * Mobile/tablet: отдельные surface-блоки; IMAGE — full-bleed hero сверху
 * (16:10), текст и actions ниже. Desktop: таблица + difficulty chip.
 */

type AdminQuestionsTableProps = {
    entries: AdminQuestionListItem[];
    labels: Dictionary['admin'];
    locale: Locale;
    emptyTitle?: string;
};

/** Compact для list-карточек: min-h-10 визуально раздувал низ карточки. */
const rowActionClassName =
    'inline-flex min-h-8 items-center rounded-sm px-0.5 text-sm font-medium underline-offset-2 motion-safe:transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

function DifficultyChip({ difficulty }: { difficulty: Difficulty }) {
    return (
        <span className="inline-flex rounded-sm bg-surface-muted px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums tracking-wide text-foreground">
            {difficulty}
        </span>
    );
}

function QuestionRowActions({
    entry,
    labels,
    locale,
    nowrap = false,
}: {
    entry: AdminQuestionListItem;
    labels: Dictionary['admin'];
    locale: Locale;
    nowrap?: boolean;
}) {
    return (
        <div
            className={
                nowrap
                    ? 'flex flex-nowrap items-center gap-x-3'
                    : 'flex flex-wrap items-center gap-x-4 gap-y-0.5'
            }
        >
            <Link
                href={`/${locale}/admin/questions/${entry.id}/edit`}
                className={`${rowActionClassName} text-primary hover:text-primary-hover`}
            >
                {labels.editLink}
            </Link>

            {entry.isActive ? (
                <form
                    action={deactivateQuestionAction}
                    className="inline-flex"
                >
                    <input type="hidden" name="locale" value={locale} />
                    <input
                        type="hidden"
                        name="questionId"
                        value={entry.id}
                    />
                    <SubmitButton
                        unstyled
                        className={`${rowActionClassName} cursor-pointer text-warning hover:opacity-90`}
                    >
                        {labels.deactivateButton}
                    </SubmitButton>
                </form>
            ) : (
                <form action={activateQuestionAction} className="inline-flex">
                    <input type="hidden" name="locale" value={locale} />
                    <input
                        type="hidden"
                        name="questionId"
                        value={entry.id}
                    />
                    <SubmitButton
                        unstyled
                        className={`${rowActionClassName} cursor-pointer text-success hover:opacity-90`}
                    >
                        {labels.activateButton}
                    </SubmitButton>
                </form>
            )}

            <form action={deleteQuestionAction} className="inline-flex">
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="questionId" value={entry.id} />
                <SubmitButton
                    unstyled
                    className={`${rowActionClassName} cursor-pointer text-danger hover:opacity-90`}
                >
                    {labels.deleteButton}
                </SubmitButton>
            </form>
        </div>
    );
}

function PromptThumb({
    url,
    alt,
}: {
    url: string;
    alt: string;
}) {
    // Desktop table only: compact fixed frame.
    return (
        <div className="h-11 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-surface-muted">
            <img
                src={url}
                alt={alt}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover object-center"
            />
        </div>
    );
}

function MissingPromptThumb({ label }: { label: string }) {
    return (
        <div
            className="flex h-11 w-16 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-surface-muted px-1 text-center text-[10px] leading-tight text-muted"
            title={label}
        >
            IMG
        </div>
    );
}

/** Full-bleed preview наверху list-карточки IMAGE_GUESS (phone/tablet). */
function CardHeroImage({
    url,
    alt,
    emptyLabel,
}: {
    url: string | null;
    alt: string;
    emptyLabel: string;
}) {
    // 320: достаточно крупно. Ближе к lg: max-h, иначе 16:10 на всю ширину ≈ гигант.
    // object-contain — админ видит весь кадр (cover сильно кропал скриншоты).
    return (
        <div className="flex w-full items-center justify-center bg-surface-muted">
            {url ? (
                <img
                    src={url}
                    alt={alt}
                    loading="lazy"
                    decoding="async"
                    className="max-h-44 w-full object-contain object-center sm:max-h-52 md:max-h-56"
                />
            ) : (
                <div className="flex h-36 w-full items-center justify-center border-b border-dashed border-border px-4 text-center text-xs text-muted sm:h-40">
                    {emptyLabel}
                </div>
            )}
        </div>
    );
}

function ListCardMeta({
    entry,
    labels,
    locale,
}: {
    entry: AdminQuestionListItem;
    labels: Dictionary['admin'];
    locale: Locale;
}) {
    return (
        <p className="mt-1 text-xs text-muted">
            <span>{entry.category}</span>
            <span aria-hidden className="mx-1.5">
                ·
            </span>
            <span>
                {labels.tableOptions}: {entry.optionsCount}
            </span>
            <span aria-hidden className="mx-1.5">
                ·
            </span>
            <time className="font-mono tabular-nums">
                {entry.createdAt.toLocaleDateString(locale)}
            </time>
        </p>
    );
}

function ListCardBadges({
    entry,
    labels,
    showTypeLabel,
    typeLabel,
}: {
    entry: AdminQuestionListItem;
    labels: Dictionary['admin'];
    showTypeLabel: boolean;
    typeLabel: string;
}) {
    return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <DifficultyChip difficulty={entry.difficulty} />
            <span
                className={
                    entry.isActive
                        ? 'text-xs font-medium text-success'
                        : 'text-xs font-medium text-muted'
                }
            >
                {entry.isActive
                    ? labels.statusActive
                    : labels.statusInactive}
            </span>
            {showTypeLabel ? (
                <span className="text-xs text-muted">{typeLabel}</span>
            ) : null}
        </div>
    );
}

export function AdminQuestionsTable({
    entries,
    labels,
    locale,
    emptyTitle,
}: AdminQuestionsTableProps) {
    if (entries.length === 0) {
        return (
            <EmptyState
                className="mt-6"
                title={emptyTitle ?? labels.empty}
            />
        );
    }

    return (
        <div className="mt-6">
            <ul className="space-y-3 lg:hidden">
                {entries.map((entry) => {
                    const isImage = entry.type === 'IMAGE_GUESS';
                    const typeLabel = isImage
                        ? labels.formQuestionTypeImageGuess
                        : labels.formQuestionTypeText;

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
                                        <div className="min-w-0">
                                            <ListCardBadges
                                                entry={entry}
                                                labels={labels}
                                                showTypeLabel
                                                typeLabel={typeLabel}
                                            />
                                            <p className="mt-1.5 line-clamp-2 text-sm font-medium leading-snug text-foreground">
                                                {entry.text}
                                            </p>
                                            <ListCardMeta
                                                entry={entry}
                                                labels={labels}
                                                locale={locale}
                                            />
                                        </div>
                                        <QuestionRowActions
                                            entry={entry}
                                            labels={labels}
                                            locale={locale}
                                        />
                                    </div>
                                </>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    <div className="min-w-0">
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
                                            labels={labels}
                                            locale={locale}
                                        />
                                    </div>
                                    <QuestionRowActions
                                        entry={entry}
                                        labels={labels}
                                        locale={locale}
                                    />
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>

            <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface lg:block">
                <table className="w-full border-collapse text-left text-sm">
                    <thead>
                        <tr className="border-b border-border bg-surface-muted/50 text-muted">
                            <th className="px-4 py-2 font-medium">
                                {labels.tableQuestion}
                            </th>
                            <th className="whitespace-nowrap px-3 py-2 font-medium">
                                {labels.tableDifficulty}
                            </th>
                            <th className="hidden whitespace-nowrap px-3 py-2 font-medium xl:table-cell">
                                {labels.tableCategory}
                            </th>
                            <th className="whitespace-nowrap px-3 py-2 font-medium">
                                {labels.tableOptions}
                            </th>
                            <th className="whitespace-nowrap px-3 py-2 font-medium">
                                {labels.tableStatus}
                            </th>
                            <th className="hidden whitespace-nowrap px-3 py-2 font-medium xl:table-cell">
                                {labels.tableCreated}
                            </th>
                            <th className="sticky right-0 bg-surface-muted/50 px-4 py-2 font-medium shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)]">
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

                            return (
                                <tr
                                    key={entry.id}
                                    className="group border-b border-border last:border-b-0 hover:bg-surface-hover/40"
                                >
                                    <td className="min-w-0 px-4 py-2.5 text-foreground">
                                        <div className="flex items-center gap-3">
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
                                                    className="shrink-0 rounded-sm bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide text-muted"
                                                    title={typeLabel}
                                                >
                                                    TEXT
                                                </span>
                                            )}
                                            <span className="line-clamp-2 min-w-0">
                                                {entry.text}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2.5">
                                        <DifficultyChip
                                            difficulty={entry.difficulty}
                                        />
                                    </td>
                                    <td className="hidden whitespace-nowrap px-3 py-2.5 text-muted xl:table-cell">
                                        {entry.category}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-sm tabular-nums text-foreground">
                                        {entry.optionsCount}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2.5">
                                        <span
                                            className={
                                                entry.isActive
                                                    ? 'font-medium text-success'
                                                    : 'font-medium text-muted'
                                            }
                                        >
                                            {entry.isActive
                                                ? labels.statusActive
                                                : labels.statusInactive}
                                        </span>
                                    </td>
                                    <td className="hidden whitespace-nowrap px-3 py-2.5 font-mono text-sm tabular-nums text-muted xl:table-cell">
                                        {entry.createdAt.toLocaleDateString(
                                            locale,
                                        )}
                                    </td>
                                    <td className="sticky right-0 whitespace-nowrap bg-surface px-4 py-2.5 shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)] group-hover:bg-surface-hover">
                                        <QuestionRowActions
                                            entry={entry}
                                            labels={labels}
                                            locale={locale}
                                            nowrap
                                        />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
