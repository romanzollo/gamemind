import { deleteQuestionAction } from '@/features/admin/actions';
import type { Dictionary, Locale } from '@/shared/i18n';
import type { AdminQuestionListItem } from '../types';

type AdminQuestionsTableProps = {
    entries: AdminQuestionListItem[];
    labels: Dictionary['admin'];
    locale: Locale;
};

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

    return (
        <div className="mt-6 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
                <thead>
                    <tr className="border-b border-(--border) text-neutral-500 dark:text-neutral-400">
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
                            className="border-b border-(--border)"
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
                                    <button
                                        type="submit"
                                        className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                                    >
                                        {labels.deleteButton}
                                    </button>
                                </form>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
