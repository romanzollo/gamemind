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

function formatCorrect(
    correctCount: number,
    totalQuestions: number,
    ofWord: string,
) {
    return `${correctCount} ${ofWord} ${totalQuestions}`;
}

const reviewLinkClassName =
    'text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

const phoneRowClassName =
    'block px-3 py-3 motion-safe:transition-colors hover:bg-surface-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

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
        <div className="mt-4">
            {/*
              Phone (&lt;480px): padded row + scoreboard metrics (Верно выделен).
              480px+: table.
            */}
            <ul className="divide-y divide-border min-[480px]:hidden">
                {entries.map((entry) => {
                    const difficulty = difficultyLabel(
                        entry.difficulty,
                        difficultyLabels,
                    );
                    const href = `/${locale}/result/${entry.sessionId}`;
                    const correctText = formatCorrect(
                        entry.correctCount,
                        entry.totalQuestions,
                        labels.historyOf,
                    );

                    return (
                        <li key={entry.sessionId}>
                            <Link href={href} className={phoneRowClassName}>
                                <div className="flex items-baseline justify-between gap-3">
                                    <p className="min-w-0 truncate text-sm text-foreground">
                                        <time
                                            dateTime={entry.completedAt.toISOString()}
                                            className="font-mono tabular-nums"
                                        >
                                            {entry.completedAt.toLocaleDateString(
                                                locale,
                                            )}
                                        </time>
                                        <span
                                            aria-hidden
                                            className="mx-1.5 text-muted"
                                        >
                                            ·
                                        </span>
                                        <span className="text-muted">
                                            {difficulty}
                                        </span>
                                    </p>
                                    <span
                                        className={`${reviewLinkClassName} shrink-0 text-sm`}
                                    >
                                        {labels.historyView}
                                    </span>
                                </div>

                                <div className="mt-2.5 grid grid-cols-2 gap-4">
                                    <p>
                                        <span className="block text-xs font-medium text-muted">
                                            {labels.historyScore}
                                        </span>
                                        <span className="font-display text-xl font-semibold tabular-nums tracking-wide text-foreground">
                                            {entry.score}
                                        </span>
                                    </p>
                                    <p>
                                        <span className="block text-xs font-medium text-muted">
                                            {labels.historyCorrect}
                                        </span>
                                        <span className="font-display text-xl font-semibold tabular-nums tracking-wide text-success">
                                            {correctText}
                                        </span>
                                    </p>
                                </div>
                            </Link>
                        </li>
                    );
                })}
            </ul>

            <div className="hidden overflow-x-auto min-[480px]:block">
                <table className="w-full border-collapse text-left text-sm">
                    <thead>
                        <tr className="border-b border-border text-muted">
                            <th className="whitespace-nowrap py-2 pr-3 font-medium sm:pr-4">
                                {labels.historyDate}
                            </th>
                            <th className="whitespace-nowrap py-2 pr-3 font-medium sm:pr-4">
                                {labels.historyDifficulty}
                            </th>
                            <th className="whitespace-nowrap py-2 pr-3 font-medium sm:pr-4">
                                {labels.historyScore}
                            </th>
                            <th className="whitespace-nowrap py-2 pr-3 font-medium sm:pr-4">
                                {labels.historyCorrect}
                            </th>
                            <th className="whitespace-nowrap py-2 font-medium">
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
                                <td className="whitespace-nowrap py-3 pr-3 font-mono tabular-nums text-foreground sm:pr-4">
                                    {entry.completedAt.toLocaleDateString(
                                        locale,
                                    )}
                                </td>
                                <td className="whitespace-nowrap py-3 pr-3 text-foreground sm:pr-4">
                                    {difficultyLabel(
                                        entry.difficulty,
                                        difficultyLabels,
                                    )}
                                </td>
                                <td className="whitespace-nowrap py-3 pr-3 font-mono tabular-nums text-foreground sm:pr-4">
                                    {entry.score}
                                </td>
                                <td className="whitespace-nowrap py-3 pr-3 font-mono tabular-nums text-foreground sm:pr-4">
                                    {formatCorrect(
                                        entry.correctCount,
                                        entry.totalQuestions,
                                        labels.historyOf,
                                    )}
                                </td>
                                <td className="whitespace-nowrap py-3">
                                    <Link
                                        href={`/${locale}/result/${entry.sessionId}`}
                                        className={reviewLinkClassName}
                                    >
                                        {labels.historyView}
                                    </Link>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
