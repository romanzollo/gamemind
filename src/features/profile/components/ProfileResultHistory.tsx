import Link from 'next/link';

import type { Difficulty } from '@/features/quiz/types';
import type { Dictionary } from '@/shared/i18n';

import type { ProfileResultHistoryEntry } from '../types/result-history-entry';

type ProfileResultHistoryProps = {
    entries: ProfileResultHistoryEntry[];
    locale: string;
    labels: Dictionary['profile'];
    difficultyLabels: Pick<
        Dictionary['quiz'],
        'easy' | 'medium' | 'hard'
    >;
};

function difficultyLabel(
    difficulty: Difficulty,
    labels: ProfileResultHistoryProps['difficultyLabels'],
): string {
    switch (difficulty) {
        case 'EASY':
            return labels.easy;
        case 'MEDIUM':
            return labels.medium;
        case 'HARD':
            return labels.hard;
    }
}

export function ProfileResultHistory({
    entries,
    locale,
    labels,
    difficultyLabels,
}: ProfileResultHistoryProps) {
    if (entries.length === 0) {
        return (
            <p className="mt-4 text-neutral-600 dark:text-neutral-400">
                {labels.historyEmpty}
            </p>
        );
    }

    return (
        <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
                <thead>
                    <tr className="border-b border-border text-neutral-500 dark:text-neutral-400">
                        <th className="py-2 pr-4">{labels.historyDate}</th>
                        <th className="py-2 pr-4">
                            {labels.historyDifficulty}
                        </th>
                        <th className="py-2 pr-4">{labels.historyScore}</th>
                        <th className="py-2 pr-4">{labels.historyCorrect}</th>
                        <th className="py-2">{labels.historyView}</th>
                    </tr>
                </thead>
                <tbody>
                    {entries.map((entry) => (
                        <tr
                            key={entry.sessionId}
                            className="border-b border-border"
                        >
                            <td className="py-3 pr-4 tabular-nums">
                                {entry.completedAt.toLocaleDateString(locale)}
                            </td>
                            <td className="py-3 pr-4">
                                {difficultyLabel(
                                    entry.difficulty,
                                    difficultyLabels,
                                )}
                            </td>
                            <td className="py-3 pr-4 tabular-nums">
                                {entry.score}
                            </td>
                            <td className="py-3 pr-4 tabular-nums">
                                {entry.correctCount} / {entry.totalQuestions}
                            </td>
                            <td className="py-3">
                                <Link
                                    href={`/${locale}/result/${entry.sessionId}`}
                                    className="text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                                >
                                    {labels.historyView}
                                </Link>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
