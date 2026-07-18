import Link from 'next/link';

import {
    activateQuestionAction,
    deactivateQuestionAction,
    deleteQuestionAction,
} from '@/features/admin/actions/questions';
import type { Dictionary, Locale } from '@/shared/i18n';
import { SubmitButton } from '@/shared/ui';
import type { AdminQuestionListItem } from '../types';

// тип пропсов компонента таблицы вопросов для администрирования
type AdminQuestionsTableProps = {
    entries: AdminQuestionListItem[];
    labels: Dictionary['admin'];
    locale: Locale;
};

// компонент таблицы вопросов для администрирования
export function AdminQuestionsTable({
    entries,
    labels,
    locale,
}: AdminQuestionsTableProps) {
    if (entries.length === 0) {
        return (
            <p className="mt-6 text-neutral-600 dark:text-neutral-400">
                {labels.empty}
            </p>
        );
    }

    // функция для получения локализованного href
    function localizedHref(href: string) {
        return `/${locale}${href}`;
    }

    return (
        <div className="mt-6 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
                <thead>
                    <tr className="border-b border-border text-neutral-500 dark:text-neutral-400">
                        <th className="py-2 pr-4">{labels.tableQuestion}</th>
                        <th className="py-2 pr-4">{labels.tableDifficulty}</th>
                        <th className="py-2 pr-4">{labels.tableCategory}</th>
                        <th className="py-2 pr-4">{labels.tableOptions}</th>
                        <th className="py-2 pr-4">{labels.tableStatus}</th>
                        <th className="py-2 pr-4">{labels.tableCreated}</th>
                        <th className="py-2">{labels.tableActions}</th>
                    </tr>
                </thead>

                <tbody>
                    {entries.map((entry) => (
                        <tr
                            key={entry.id}
                            className="border-b border-border"
                        >
                            <td className="py-3 pr-4">{entry.text}</td>
                            <td className="py-3 pr-4">{entry.difficulty}</td>
                            <td className="py-3 pr-4">{entry.category}</td>
                            <td className="py-3 pr-4">{entry.optionsCount}</td>
                            <td className="py-3 pr-4">
                                {entry.isActive
                                    ? labels.statusActive
                                    : labels.statusInactive}
                            </td>
                            <td className="py-3 pr-4">
                                {entry.createdAt.toLocaleDateString()}
                            </td>
                            <td className="py-3">
                                <div className="flex items-center gap-3">
                                    <Link
                                        href={localizedHref(
                                            `/admin/questions/${entry.id}/edit`,
                                        )}
                                        className="text-blue-600 transition-colors hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
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
                                            <SubmitButton className="cursor-pointer text-amber-600 transition-colors hover:text-amber-800 hover:underline dark:text-amber-400 dark:hover:text-amber-300">
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
                                                className="cursor-pointer text-green-600 transition-colors hover:text-green-800 hover:underline dark:text-green-400 dark:hover:text-green-300"
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
                                        <SubmitButton className="cursor-pointer text-red-600 transition-colors hover:text-red-800 hover:underline dark:text-red-400 dark:hover:text-red-300">
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
