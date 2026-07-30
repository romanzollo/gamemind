/**
 * Компактный рейтинг сегодняшнего Daily Challenge (Scoreboard Editorial).
 *
 * Server Component: только чтение entries с родителя.
 * Проще полного `/leaderboard`: без даты (все за один день), top-N strip.
 */

import type { LeaderboardEntry } from '@/features/leaderboard/types/leaderboard-entry';
import { EmptyState } from '@/shared/ui';

type DailyChallengeBoardProps = {
    entries: LeaderboardEntry[];
    labels: {
        boardTitle: string;
        boardEmpty: string;
        rank: string;
        player: string;
        score: string;
        accuracy: string;
    };
};

function accuracyText(correctCount: number, totalQuestions: number) {
    return `${correctCount}/${totalQuestions}`;
}

function RankMark({ rank, rankLabel }: { rank: number; rankLabel: string }) {
    const aria = `${rankLabel} ${rank}`;

    if (rank === 1) {
        return (
            <span
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-display text-xs font-semibold tabular-nums"
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
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-display text-xs font-semibold tabular-nums"
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
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-display text-xs font-semibold tabular-nums"
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
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center font-mono text-xs tabular-nums text-muted"
            aria-label={aria}
        >
            {rank}
        </span>
    );
}

export function DailyChallengeBoard({
    entries,
    labels,
}: DailyChallengeBoardProps) {
    return (
        <section
            aria-labelledby="daily-challenge-board-heading"
            className="mt-4 border-t border-border pt-4"
        >
            <h3
                id="daily-challenge-board-heading"
                className="font-mono text-[0.65rem] font-medium uppercase tracking-[0.14em] text-muted"
            >
                {labels.boardTitle}
            </h3>

            {entries.length === 0 ? (
                <EmptyState className="mt-3" title={labels.boardEmpty} />
            ) : (
                <ol className="mt-3 divide-y divide-border">
                    {entries.map((entry) => {
                        const accuracy = accuracyText(
                            entry.correctCount,
                            entry.totalQuestions,
                        );

                        return (
                            <li
                                key={entry.userId}
                                className="flex items-center gap-3 py-2.5"
                            >
                                <RankMark
                                    rank={entry.rank}
                                    rankLabel={labels.rank}
                                />
                                <div className="min-w-0 flex-1 truncate font-medium text-foreground">
                                    {entry.username}
                                </div>
                                <span
                                    className="shrink-0 font-mono text-xs tabular-nums text-muted"
                                    aria-label={`${labels.accuracy} ${accuracy}`}
                                >
                                    {accuracy}
                                </span>
                                <span
                                    className="w-10 shrink-0 text-right font-display text-lg font-semibold tabular-nums text-foreground"
                                    aria-label={`${labels.score} ${entry.score}`}
                                >
                                    {entry.score}
                                </span>
                            </li>
                        );
                    })}
                </ol>
            )}
        </section>
    );
}
