import type { Dictionary, Locale } from '@/shared/i18n';
import { EmptyState } from '@/shared/ui';
import type { LeaderboardEntry } from '../types/leaderboard-entry';

/**
 * Публичный рейтинг (Scoreboard Editorial).
 *
 * Колонки: score (ранжирование) ≠ accuracy ≠ date.
 * Акцент на очках (display + semibold). Топ-3 — компактные медальоны
 * (токены podium-*), не emoji-короны и не glow.
 *
 * &lt;sm: плотная строка (место | имя+мета | очки справа), max-w-md.
 * sm+: таблица w-full + filler-колонка справа (без дыры между именем и очками).
 */

type LeaderboardTableProps = {
    entries: LeaderboardEntry[];
    locale: Locale;
    labels: Dictionary['leaderboard'];
};

function formatCompletedAt(completedAt: Date, locale: Locale) {
    return completedAt.toLocaleDateString(locale);
}

function accuracyText(correctCount: number, totalQuestions: number) {
    return `${correctCount}/${totalQuestions}`;
}

/** Медальон 1–3 или обычный mono-ранг. Номер всегда в разметке (не color-only). */
function RankMark({
    rank,
    rankLabel,
}: {
    rank: number;
    rankLabel: string;
}) {
    const aria = `${rankLabel} ${rank}`;

    // Inline var() — надёжнее, чем bg-podium-* (Tailwind иногда ломает имена с цифрами).
    if (rank === 1) {
        return (
            <span
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-display text-sm font-semibold tabular-nums"
                style={{
                    backgroundColor: 'var(--podium-gold)',
                    color: 'var(--podium-gold-fg)',
                }}
                aria-label={aria}
            >
                {rank}
            </span>
        );
    }

    if (rank === 2) {
        return (
            <span
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-display text-sm font-semibold tabular-nums"
                style={{
                    backgroundColor: 'var(--podium-silver)',
                    color: 'var(--podium-silver-fg)',
                }}
                aria-label={aria}
            >
                {rank}
            </span>
        );
    }

    if (rank === 3) {
        return (
            <span
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-display text-sm font-semibold tabular-nums"
                style={{
                    backgroundColor: 'var(--podium-bronze)',
                    color: 'var(--podium-bronze-fg)',
                }}
                aria-label={aria}
            >
                {rank}
            </span>
        );
    }

    return (
        <span
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center font-mono text-sm tabular-nums text-muted"
            aria-label={aria}
        >
            {rank}
        </span>
    );
}

export function LeaderboardTable({
    entries,
    locale,
    labels,
}: LeaderboardTableProps) {
    if (entries.length === 0) {
        return <EmptyState className="mt-4" title={labels.empty} />;
    }

    return (
        // mt меньше: фильтр сложности уже даёт border-b разделитель
        <div className="mt-4 sm:mt-5">
            {/*
              MOBILE (<sm):
              max-w-md — без дыры на landscape.
              Место слева, имя+мета, очки справа.
            */}
            <ol className="mx-auto max-w-md divide-y divide-border sm:hidden">
                {entries.map((entry) => {
                    const accuracy = accuracyText(
                        entry.correctCount,
                        entry.totalQuestions,
                    );
                    const dateLabel = formatCompletedAt(
                        entry.completedAt,
                        locale,
                    );

                    return (
                        <li
                            key={entry.userId}
                            className="flex items-center gap-3 py-3.5"
                        >
                            <div className="w-7 shrink-0">
                                <RankMark
                                    rank={entry.rank}
                                    rankLabel={labels.rank}
                                />
                            </div>

                            <div className="min-w-0 flex-1">
                                <div className="truncate font-medium text-foreground">
                                    {entry.username}
                                </div>
                                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
                                    <span
                                        className="font-medium text-success"
                                        aria-label={`${labels.accuracy} ${accuracy}`}
                                    >
                                        {accuracy}
                                    </span>
                                    <span className="opacity-40" aria-hidden>
                                        ·
                                    </span>
                                    <time
                                        dateTime={entry.completedAt.toISOString()}
                                        className="tabular-nums"
                                    >
                                        {dateLabel}
                                    </time>
                                </div>
                            </div>

                            <div className="shrink-0 pl-2 text-right">
                                <div
                                    className="font-display text-xl font-semibold tabular-nums tracking-wide text-foreground"
                                    aria-label={`${labels.score} ${entry.score}`}
                                >
                                    {entry.score}
                                </div>
                            </div>
                        </li>
                    );
                })}
            </ol>

            {/*
              DESKTOP (sm+):
              w-full + filler-колонка: данные слева, линии на всю ширину.
            */}
            <div className="hidden sm:block">
                <table className="w-full border-collapse text-left text-sm">
                    <thead>
                        <tr className="border-b border-border bg-surface-muted/60 text-xs font-medium uppercase tracking-wider text-muted">
                            <th className="whitespace-nowrap py-3 pl-4 pr-6 sm:pl-6">
                                {labels.rank}
                            </th>
                            <th className="whitespace-nowrap py-3 pr-8">
                                {labels.player}
                            </th>
                            <th className="whitespace-nowrap py-3 pr-8">
                                {labels.score}
                            </th>
                            <th className="whitespace-nowrap py-3 pr-8">
                                {labels.accuracy}
                            </th>
                            <th className="whitespace-nowrap py-3 pr-4">
                                {labels.date}
                            </th>
                            <th className="w-full" aria-hidden />
                        </tr>
                    </thead>
                    <tbody>
                        {entries.map((entry) => (
                            <tr
                                key={entry.userId}
                                className="group border-b border-border motion-safe:transition-colors hover:bg-surface-muted/40"
                            >
                                <td className="whitespace-nowrap py-4 pl-4 pr-6 sm:pl-6">
                                    <RankMark
                                        rank={entry.rank}
                                        rankLabel={labels.rank}
                                    />
                                </td>
                                <td className="whitespace-nowrap py-4 pr-8 text-base font-medium text-foreground">
                                    {entry.username}
                                </td>
                                <td className="whitespace-nowrap py-4 pr-8 font-display text-2xl font-semibold tabular-nums tracking-wide text-foreground">
                                    {entry.score}
                                </td>
                                <td className="whitespace-nowrap py-4 pr-8 font-mono text-base font-medium tabular-nums text-success">
                                    {accuracyText(
                                        entry.correctCount,
                                        entry.totalQuestions,
                                    )}
                                </td>
                                <td className="whitespace-nowrap py-4 pr-4 font-mono text-sm tabular-nums text-muted">
                                    <time
                                        dateTime={entry.completedAt.toISOString()}
                                    >
                                        {formatCompletedAt(
                                            entry.completedAt,
                                            locale,
                                        )}
                                    </time>
                                </td>
                                <td className="w-full" aria-hidden />
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
