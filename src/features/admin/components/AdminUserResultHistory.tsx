import type { QuizSetupDifficulty } from '@/features/quiz/types';
import {
    getSessionDifficultyChipToneClass,
    getSessionDifficultyLabel,
} from '@/features/quiz/lib/session-difficulty-label';
import type { Dictionary, Locale } from '@/shared/i18n';
import { EmptyState } from '@/shared/ui';

import type { AdminUserResultHistoryEntry } from '../types';

/**
 * Недавние результаты на admin user detail: Scoreboard Editorial,
 * визуально как ProfileResultHistory (phone stack + table sm+).
 *
 * Без ссылки «Обзор»: /result owner-only — чужой обзор сломает UX
 * (см. DECISIONS → Admin user support detail). Presentation only.
 */

type AdminUserResultHistoryProps = {
    entries: AdminUserResultHistoryEntry[];
    locale: Locale;
    labels: Pick<
        Dictionary['admin'],
        | 'userHistoryEmpty'
        | 'userHistoryDate'
        | 'userHistoryDifficulty'
        | 'userHistoryScore'
        | 'userHistoryCorrect'
        | 'userHistoryOf'
    >;
    difficultyLabels: Pick<
        Dictionary['quiz'],
        'easy' | 'medium' | 'hard' | 'mixed'
    >;
};

function difficultyLabel(
    difficulty: QuizSetupDifficulty,
    labels: AdminUserResultHistoryProps['difficultyLabels'],
) {
    return getSessionDifficultyLabel(difficulty, labels);
}

/** Как в профиле: EASY = foreground; MIXED = info, не Medium. */
function DifficultyChip({
    difficulty,
    label,
}: {
    difficulty: QuizSetupDifficulty;
    label: string;
}) {
    return (
        <span
            className={`inline-flex shrink-0 items-center rounded-sm bg-surface-muted px-2 py-0.5 text-[11px] font-semibold tracking-wide ${getSessionDifficultyChipToneClass(difficulty)}`}
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

function completedDate(iso: string, locale: Locale) {
    return new Date(iso).toLocaleDateString(locale);
}

export function AdminUserResultHistory({
    entries,
    locale,
    labels,
    difficultyLabels,
}: AdminUserResultHistoryProps) {
    if (entries.length === 0) {
        return (
            <EmptyState className="mt-4" title={labels.userHistoryEmpty} />
        );
    }

    return (
        <div className="mt-4">
            {/* Phone: scoreboard-stack как /profile */}
            <ul className="divide-y divide-border sm:hidden">
                {entries.map((entry) => {
                    const difficulty = difficultyLabel(
                        entry.difficulty,
                        difficultyLabels,
                    );
                    const correctText = formatCorrect(
                        entry.correctCount,
                        entry.totalQuestions,
                        labels.userHistoryOf,
                    );

                    return (
                        <li key={entry.sessionId} className="px-0 py-3.5">
                            <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                                <time
                                    dateTime={entry.completedAt}
                                    className="shrink-0 font-mono text-xs tabular-nums text-muted"
                                >
                                    {completedDate(entry.completedAt, locale)}
                                </time>
                                <DifficultyChip
                                    difficulty={entry.difficulty}
                                    label={difficulty}
                                />
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-4">
                                <p>
                                    <span className="block text-[11px] font-medium uppercase tracking-wide text-muted">
                                        {labels.userHistoryScore}
                                    </span>
                                    <span className="mt-0.5 block font-display text-2xl font-semibold tabular-nums tracking-wide text-foreground">
                                        {entry.score}
                                    </span>
                                </p>
                                <p>
                                    <span className="block text-[11px] font-medium uppercase tracking-wide text-muted">
                                        {labels.userHistoryCorrect}
                                    </span>
                                    <span className="mt-0.5 block font-display text-2xl font-semibold tabular-nums tracking-wide text-success">
                                        {correctText}
                                    </span>
                                </p>
                            </div>
                        </li>
                    );
                })}
            </ul>

            {/* sm+: таблица как профиль (без колонки Обзор) */}
            <div className="hidden overflow-x-auto sm:block">
                <table className="w-full border-collapse text-left text-sm">
                    <thead>
                        <tr className="border-b border-border bg-surface-muted/60 text-[11px] font-medium uppercase tracking-wide text-muted">
                            <th className="whitespace-nowrap py-2.5 pl-3 pr-3 sm:pr-4">
                                {labels.userHistoryDate}
                            </th>
                            <th className="whitespace-nowrap py-2.5 pr-3 sm:pr-4">
                                {labels.userHistoryDifficulty}
                            </th>
                            <th className="whitespace-nowrap py-2.5 pr-3 sm:pr-4">
                                {labels.userHistoryScore}
                            </th>
                            <th className="whitespace-nowrap py-2.5 pr-3 sm:pr-4">
                                {labels.userHistoryCorrect}
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
                                    {completedDate(entry.completedAt, locale)}
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
                                        labels.userHistoryOf,
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
