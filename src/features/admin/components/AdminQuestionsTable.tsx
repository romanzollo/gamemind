import Link from 'next/link';

import {
    activateQuestionAction,
    deactivateQuestionAction,
    deleteQuestionAction,
} from '@/features/admin/actions/questions';
import type { Dictionary, Locale } from '@/shared/i18n';
import { EmptyState, SubmitButton } from '@/shared/ui';
import type { AdminQuestionListItem } from '../types';

type AdminQuestionsTableProps = {
    entries: AdminQuestionListItem[];
    labels: Dictionary['admin'];
    locale: Locale;
};

/** Плотные текстовые действия в строке таблицы (не full Button). */
const rowActionClassName =
    'rounded-sm text-sm font-medium underline-offset-2 motion-safe:transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export function AdminQuestionsTable({
    entries,
    labels,
    locale,
}: AdminQuestionsTableProps) {
    if (entries.length === 0) {
        return <EmptyState className="mt-6" title={labels.empty} />;
    }

    function localizedHref(href: string) {
        return `/${locale}${href}`;
    }

    return (
        <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full border-collapse text-left text-sm">
                <thead>
                    <tr className="border-b border-border bg-surface-muted/50 text-muted">
                        <th className="px-3 py-2 font-medium sm:px-4">
                            {labels.tableQuestion}
                        </th>
                        <th className="px-3 py-2 font-medium sm:px-4">
                            {labels.tableDifficulty}
                        </th>
                        <th className="px-3 py-2 font-medium sm:px-4">
                            {labels.tableCategory}
                        </th>
                        <th className="px-3 py-2 font-medium sm:px-4">
                            {labels.tableOptions}
                        </th>
                        <th className="px-3 py-2 font-medium sm:px-4">
                            {labels.tableStatus}
                        </th>
                        <th className="px-3 py-2 font-medium sm:px-4">
                            {labels.tableCreated}
                        </th>
                        <th className="px-3 py-2 font-medium sm:px-4">
                            {labels.tableActions}
                        </th>
                    </tr>
                </thead>

                <tbody>
                    {entries.map((entry) => (
                        <tr
                            key={entry.id}
                            className="border-b border-border last:border-b-0 hover:bg-surface-hover/40"
                        >
                            <td className="max-w-xs px-3 py-2 text-foreground sm:max-w-md sm:px-4">
                                <span className="line-clamp-2">{entry.text}</span>
                            </td>
                            <td className="px-3 py-2 font-mono text-xs tabular-nums text-foreground sm:px-4 sm:text-sm">
                                {entry.difficulty}
                            </td>
                            <td className="px-3 py-2 text-muted sm:px-4">
                                {entry.category}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs tabular-nums text-foreground sm:px-4 sm:text-sm">
                                {entry.optionsCount}
                            </td>
                            <td className="px-3 py-2 sm:px-4">
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
                            <td className="px-3 py-2 font-mono text-xs tabular-nums text-muted sm:px-4 sm:text-sm">
                                {entry.createdAt.toLocaleDateString()}
                            </td>
                            <td className="px-3 py-2 sm:px-4">
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                    <Link
                                        href={localizedHref(
                                            `/admin/questions/${entry.id}/edit`,
                                        )}
                                        className={`${rowActionClassName} text-primary hover:text-primary-hover`}
                                    >
                                        {labels.editLink}
                                    </Link>

                                    {entry.isActive ? (
                                        <form action={deactivateQuestionAction}>
                                            <input
                                                type="hidden"
                                                name="locale"
                                                value={locale}
                                            />
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
                                        <form action={activateQuestionAction}>
                                            <input
                                                type="hidden"
                                                name="locale"
                                                value={locale}
                                            />
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

                                    <form action={deleteQuestionAction}>
                                        <input
                                            type="hidden"
                                            name="locale"
                                            value={locale}
                                        />
                                        <input
                                            type="hidden"
                                            name="questionId"
                                            value={entry.id}
                                        />
                                        <SubmitButton
                                            unstyled
                                            className={`${rowActionClassName} cursor-pointer text-danger hover:opacity-90`}
                                        >
                                            {labels.deleteButton}
                                        </SubmitButton>
                                    </form>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
