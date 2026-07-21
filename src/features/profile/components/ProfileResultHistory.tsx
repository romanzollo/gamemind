import Link from 'next/link';

import type { Difficulty } from '@/features/quiz/types';
import type { Dictionary } from '@/shared/i18n';
import { EmptyState } from '@/shared/ui';

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
            <EmptyState className="mt-4" title={labels.historyEmpty} />
        );
    }

    return (
        <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
                <thead>
                    <tr className="border-b border-border text-muted">
                        <th className="py-2 pr-4 font-medium">
                            {labels.historyDate}
                        </th>
                        <th className="py-2 pr-4 font-medium">
                            {labels.historyDifficulty}
                        </th>
                        <th className="py-2 pr-4 font-medium">
                            {labels.historyScore}
                        </th>
                        <th className="py-2 pr-4 font-medium">
                            {labels.historyCorrect}
                        </th>
                        <th className="py-2 font-medium">
                            {labels.historyView}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {entries.map((entry) => (
                        <tr
                            key={entry.sessionId}
                            className="border-b border-border"
                        >
                            <td className="py-3 pr-4 font-mono tabular-nums text-foreground">
                                {entry.completedAt.toLocaleDateString(locale)}
                            </td>
                            <td className="py-3 pr-4 text-foreground">
                                {difficultyLabel(
                                    entry.difficulty,
                                    difficultyLabels,
                                )}
                            </td>
                            <td className="py-3 pr-4 font-mono tabular-nums text-foreground">
                                {entry.score}
                            </td>
                            <td className="py-3 pr-4 font-mono tabular-nums text-foreground">
                                {entry.correctCount} / {entry.totalQuestions}
                            </td>
                            <td className="py-3">
                                <Link
                                    href={`/${locale}/result/${entry.sessionId}`}
                                    className="text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
