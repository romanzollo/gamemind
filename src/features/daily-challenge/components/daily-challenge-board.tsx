/**
 * Рейтинг сегодняшнего Челленджа на главной (Scoreboard Editorial).
 *
 * Server Component: только чтение entries с родителя. Сразу видны топ‑3,
 * остальные из топ‑10 — по «Весь рейтинг дня» (`<details>`, без JS и без
 * нового запроса). Игрок ниже третьего места видит свою строку под топ‑3:
 * место берётся из `standing` (считает сервер тем же порядком, что доска).
 */

import type { LeaderboardEntry } from '@/features/leaderboard/types/leaderboard-entry';

const BOARD_VISIBLE_TOP = 3;

/** Строка «ты», если игрок ниже топ‑3. */
export type DailyBoardYou = {
    place: number;
    username: string;
    score: number;
    correctCount: number;
    totalQuestions: number;
};

type DailyChallengeBoardProps = {
    entries: LeaderboardEntry[];
    /** Подсветка своей строки в списке; null — посетитель или вне рейтинга. */
    currentUserId: string | null;
    you: DailyBoardYou | null;
    labels: {
        boardTitle: string;
        boardEmpty: string;
        boardFull: string;
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

type BoardRowProps = {
    rank: number;
    username: string;
    score: number;
    correctCount: number;
    totalQuestions: number;
    isYou: boolean;
    labels: DailyChallengeBoardProps['labels'];
};

function BoardRow({
    rank,
    username,
    score,
    correctCount,
    totalQuestions,
    isYou,
    labels,
}: BoardRowProps) {
    const accuracy = accuracyText(correctCount, totalQuestions);

    return (
        <li
            className={[
                'flex items-center gap-3 py-2.5',
                isYou ? '-mx-2 rounded-md bg-primary/10 px-2' : '',
            ].join(' ')}
            aria-current={isYou ? 'true' : undefined}
        >
            <RankMark rank={rank} rankLabel={labels.rank} />
            <div className="min-w-0 flex-1 truncate font-medium text-foreground">
                {username}
            </div>
            <span
                className="shrink-0 font-mono text-xs tabular-nums text-muted"
                aria-label={`${labels.accuracy} ${accuracy}`}
            >
                {accuracy}
            </span>
            <span
                className="w-10 shrink-0 text-right font-display text-lg font-semibold tabular-nums text-foreground"
                aria-label={`${labels.score} ${score}`}
            >
                {score}
            </span>
        </li>
    );
}

export function DailyChallengeBoard({
    entries,
    currentUserId,
    you,
    labels,
}: DailyChallengeBoardProps) {
    const top = entries.slice(0, BOARD_VISIBLE_TOP);
    const rest = entries.slice(BOARD_VISIBLE_TOP);
    const showYou = you !== null && you.place > BOARD_VISIBLE_TOP;
    const row = (entry: LeaderboardEntry) => (
        <BoardRow
            key={entry.userId}
            rank={entry.rank}
            username={entry.username}
            score={entry.score}
            correctCount={entry.correctCount}
            totalQuestions={entry.totalQuestions}
            isYou={entry.userId === currentUserId}
            labels={labels}
        />
    );

    return (
        <section
            aria-labelledby="daily-challenge-board-heading"
            data-testid="daily-board"
            className="group/board mt-4 border-t border-border pt-4"
        >
            <h3
                id="daily-challenge-board-heading"
                className="font-mono text-2xs font-medium uppercase tracking-[0.14em] text-muted"
            >
                {labels.boardTitle}
            </h3>

            {entries.length === 0 ? (
                <p className="mt-2 text-sm leading-relaxed text-muted" role="status">
                    {labels.boardEmpty}
                </p>
            ) : (
                <>
                    <ol className="mt-3 divide-y divide-border">
                        {top.map(row)}
                    </ol>

                    {showYou ? (
                        // В раскрытом списке своя строка уже есть — закреплённую прячем.
                        <ol
                            className="mt-1 border-t border-dashed border-border pt-1 group-has-[details[open]]/board:hidden"
                            data-testid="daily-board-you"
                        >
                            <BoardRow
                                rank={you.place}
                                username={you.username}
                                score={you.score}
                                correctCount={you.correctCount}
                                totalQuestions={you.totalQuestions}
                                isYou
                                labels={labels}
                            />
                        </ol>
                    ) : null}

                    {rest.length > 0 ? (
                        <details className="group mt-2">
                            <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1 rounded-md text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                                {labels.boardFull}
                                <svg
                                    aria-hidden
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="size-4 transition-transform group-open:rotate-180"
                                >
                                    <path d="M6 9l6 6 6-6" />
                                </svg>
                            </summary>
                            <ol
                                start={BOARD_VISIBLE_TOP + 1}
                                className="divide-y divide-border"
                            >
                                {rest.map(row)}
                            </ol>
                        </details>
                    ) : null}
                </>
            )}
        </section>
    );
}
