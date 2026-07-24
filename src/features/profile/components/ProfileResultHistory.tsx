import Link from 'next/link';

import type { Difficulty } from '@/features/quiz/types';
import type { Dictionary } from '@/shared/i18n';
import { EmptyState } from '@/shared/ui';

import type { ProfileResultHistoryEntry } from '../types/result-history-entry';

/**
 * История результатов профиля: Scoreboard Editorial.
 *
 * Узкий экран (&lt;640px): строка-мета (дата + difficulty chip + «Обзор»)
 * и две подписанные метрики. Шире — таблица с той же плашкой сложности.
 * Presentation only — без изменений scoring / snapshot.
 */

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

/**
 * Плашка сложности: `bg-surface-muted` + тон по уровню.
 * EASY = foreground (не success): зелёный в блоке только у «Верно».
 * MEDIUM/HARD = warning/danger. Текст всегда есть — не status-by-color-only.
 */
function DifficultyChip({
    difficulty,
    label,
}: {
    difficulty: Difficulty;
    label: string;
}) {
    const toneClassName =
        difficulty === 'EASY'
            ? 'text-foreground'
            : difficulty === 'MEDIUM'
              ? 'text-warning'
              : 'text-danger';

    return (
        <span
            className={`inline-flex shrink-0 items-center rounded-sm bg-surface-muted px-2 py-0.5 text-[11px] font-semibold tracking-wide ${toneClassName}`}
        >
            {label}
        </span>
    );
}

function formatCorrect(
    correctCount: number,
    totalQuestions: number,
    ofWord: string,
) {
    return `${correctCount} ${ofWord} ${totalQuestions}`;
}

/** Info blue — отделяет действие «Обзор» от success/primary teal. */
const reviewLinkClassName =
    'text-info underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

const phoneRowClassName =
    'block px-3 py-3.5 motion-safe:transition-colors hover:bg-surface-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

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
              Phone / узкий tablet (&lt;640px): scoreboard-stack.
              640px+: таблица (как раньше, но с difficulty chip).
            */}
            <ul className="divide-y divide-border sm:hidden">
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
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                                        <time
                                            dateTime={entry.completedAt.toISOString()}
                                            className="shrink-0 font-mono text-xs tabular-nums text-muted"
                                        >
                                            {entry.completedAt.toLocaleDateString(
                                                locale,
                                            )}
                                        </time>
                                        <DifficultyChip
                                            difficulty={entry.difficulty}
                                            label={difficulty}
                                        />
                                    </div>
                                    <span
                                        className={`${reviewLinkClassName} shrink-0 text-sm font-medium`}
                                    >
                                        {labels.historyView}
                                    </span>
                                </div>

                                <div className="mt-3 grid grid-cols-2 gap-4">
                                    <p>
                                        <span className="block text-[11px] font-medium uppercase tracking-wide text-muted">
                                            {labels.historyScore}
                                        </span>
                                        <span className="mt-0.5 block font-display text-2xl font-semibold tabular-nums tracking-wide text-foreground">
                                            {entry.score}
                                        </span>
                                    </p>
                                    <p>
                                        <span className="block text-[11px] font-medium uppercase tracking-wide text-muted">
                                            {labels.historyCorrect}
                                        </span>
                                        <span className="mt-0.5 block font-display text-2xl font-semibold tabular-nums tracking-wide text-success">
                                            {correctText}
                                        </span>
                                    </p>
                                </div>
                            </Link>
                        </li>
                    );
                })}
            </ul>

            <div className="hidden overflow-x-auto sm:block">
                <table className="w-full border-collapse text-left text-sm">
                    <thead>
                        <tr className="border-b border-border bg-surface-muted/60 text-[11px] font-medium uppercase tracking-wide text-muted">
                            <th className="whitespace-nowrap py-2.5 pl-3 pr-3 sm:pr-4">
                                {labels.historyDate}
                            </th>
                            <th className="whitespace-nowrap py-2.5 pr-3 sm:pr-4">
                                {labels.historyDifficulty}
                            </th>
                            <th className="whitespace-nowrap py-2.5 pr-3 sm:pr-4">
                                {labels.historyScore}
                            </th>
                            <th className="whitespace-nowrap py-2.5 pr-3 sm:pr-4">
                                {labels.historyCorrect}
                            </th>
                            <th className="whitespace-nowrap py-2.5 pr-3 font-medium sm:pr-4">
                                {labels.historyView}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {entries.map((entry) => (
                            <tr
                                key={entry.sessionId}
                                className="border-b border-border motion-safe:transition-colors hover:bg-surface-muted/40"
                            >
                                <td className="whitespace-nowrap py-3 pl-3 pr-3 font-mono text-xs tabular-nums text-muted sm:pr-4">
                                    {entry.completedAt.toLocaleDateString(
                                        locale,
                                    )}
                                </td>
                                <td className="whitespace-nowrap py-3 pr-3 sm:pr-4">
                                    <DifficultyChip
                                        difficulty={entry.difficulty}
                                        label={difficultyLabel(
                                            entry.difficulty,
                                            difficultyLabels,
                                        )}
                                    />
                                </td>
                                <td className="whitespace-nowrap py-3 pr-3 font-display text-base font-semibold tabular-nums tracking-wide text-foreground sm:pr-4">
                                    {entry.score}
                                </td>
                                <td className="whitespace-nowrap py-3 pr-3 font-display text-base font-semibold tabular-nums tracking-wide text-success sm:pr-4">
                                    {formatCorrect(
                                        entry.correctCount,
                                        entry.totalQuestions,
                                        labels.historyOf,
                                    )}
                                </td>
                                <td className="whitespace-nowrap py-3">
                                    <Link
                                        href={`/${locale}/result/${entry.sessionId}`}
                                        className={`${reviewLinkClassName} font-medium`}
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
