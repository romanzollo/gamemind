import type { CSSProperties } from 'react';

import type {
    RatingPointsByMode,
    RatingPointsEntry,
} from '@/entities/quiz-result/rating-points.repository';
import type { Dictionary } from '@/shared/i18n';
import { UserAvatar } from '@/shared/ui';
import { getAvatarPattern } from '@/shared/ui/avatar-pattern';

/**
 * Таблица очков периода — «турнирная таблица»: место · игрок · игр · очки.
 *
 * Строка — нативный `<details>`: нажатие раскрывает очки по режимам без
 * клиентского JS (Server Component). Топ-3 — медали `podium-*`, номер места
 * всегда текстом (не только цветом). Моя строка подсвечена; если я ниже
 * показанных мест — она идёт после «· · ·».
 */

type RatingTableProps = {
    entries: RatingPointsEntry[];
    /** Моя строка, если меня нет среди `entries` (ниже показанных мест). */
    trailingEntry: RatingPointsEntry | null;
    currentUserId: string | null;
    /** Плашка «Победитель недели» у первого места (прошлая неделя). */
    showWinner: boolean;
    labels: Dictionary['leaderboard'];
};

const PODIUM_STYLE: Record<1 | 2 | 3, CSSProperties> = {
    // Inline var(): Tailwind иногда ломает имена токенов с цифрами (как в доске дня).
    1: { backgroundColor: 'var(--podium-gold)', color: 'var(--podium-gold-fg)' },
    2: {
        backgroundColor: 'var(--podium-silver)',
        color: 'var(--podium-silver-fg)',
    },
    3: {
        backgroundColor: 'var(--podium-bronze)',
        color: 'var(--podium-bronze-fg)',
    },
};

const GRID_CLASS_NAME =
    'grid grid-cols-[2rem_minmax(0,1fr)_2.75rem_3.5rem] items-center gap-2 sm:grid-cols-[2.5rem_minmax(0,1fr)_4rem_5rem] sm:gap-3';

function RankMark({ rank, label }: { rank: number; label: string }) {
    const podium = rank === 1 || rank === 2 || rank === 3 ? rank : null;

    return (
        <span
            className={[
                'inline-flex h-7 w-7 items-center justify-center rounded-md text-sm tabular-nums',
                podium
                    ? 'font-display font-semibold'
                    : 'font-mono text-muted',
            ].join(' ')}
            style={podium ? PODIUM_STYLE[podium] : undefined}
            aria-label={`${label} ${rank}`}
        >
            {rank}
        </span>
    );
}

function ModeBreakdown({
    byMode,
    labels,
}: {
    byMode: RatingPointsByMode;
    labels: Dictionary['leaderboard'];
}) {
    const items: Array<{ key: keyof RatingPointsByMode; label: string }> = [
        { key: 'classic', label: labels.modeClassic },
        { key: 'blitz', label: labels.modeBlitz },
        { key: 'daily', label: labels.modeDaily },
        { key: 'survival', label: labels.modeSurvival },
    ];

    return (
        <ul
            aria-label={labels.breakdownLabel}
            className="flex flex-wrap gap-1.5 pb-3 pl-10 sm:pl-[3.25rem]"
        >
            {items.map((item) => (
                <li
                    key={item.key}
                    className="rounded-sm bg-surface-muted px-2 py-1 font-mono text-xs text-muted"
                >
                    {item.label}{' '}
                    <span className="font-medium tabular-nums text-foreground">
                        {byMode[item.key]}
                    </span>
                </li>
            ))}
        </ul>
    );
}

function RatingRow({
    entry,
    isMine,
    isWinner,
    labels,
}: {
    entry: RatingPointsEntry;
    isMine: boolean;
    isWinner: boolean;
    labels: Dictionary['leaderboard'];
}) {
    return (
        <li
            className={[
                'border-b border-border',
                isMine ? 'rounded-md border-transparent bg-primary/10' : '',
            ].join(' ')}
        >
            <details className="group">
                <summary
                    className={[
                        GRID_CLASS_NAME,
                        'min-h-13 cursor-pointer list-none px-1 py-2.5 [&::-webkit-details-marker]:hidden',
                        'rounded-md motion-safe:transition-colors hover:bg-surface-hover/60',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                    ].join(' ')}
                >
                    <RankMark rank={entry.rank} label={labels.rank} />
                    <span className="flex min-w-0 items-center gap-2.5">
                        <UserAvatar
                            src={entry.image}
                            pattern={getAvatarPattern(entry.userId)}
                        />
                        <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-baseline gap-1.5">
                                <span className="truncate font-semibold text-foreground">
                                    {entry.username}
                                </span>
                                <span
                                    className="shrink-0 font-mono text-2xs text-muted motion-safe:transition-transform group-open:rotate-180"
                                    aria-hidden
                                >
                                    ▾
                                </span>
                            </span>
                            {/* Бейджи — второй строкой: на 320 px имя не должно сжиматься до «r…». */}
                            {isMine || isWinner ? (
                                <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                    {isWinner ? (
                                        <span
                                            className="whitespace-nowrap rounded-sm px-1.5 py-0.5 font-mono text-2xs font-medium"
                                            style={{
                                                backgroundColor:
                                                    'var(--podium-legend)',
                                                color: 'var(--podium-legend-fg)',
                                            }}
                                        >
                                            {labels.winnerBadge}
                                        </span>
                                    ) : null}
                                    {isMine ? (
                                        <span className="font-mono text-2xs font-medium uppercase tracking-wider text-primary">
                                            {labels.youBadge}
                                        </span>
                                    ) : null}
                                </span>
                            ) : null}
                        </span>
                    </span>
                    <span className="text-right font-mono text-sm tabular-nums text-muted">
                        {entry.games}
                    </span>
                    <span className="text-right font-display text-xl font-semibold tabular-nums sm:text-2xl">
                        {entry.points}
                    </span>
                </summary>
                <ModeBreakdown byMode={entry.byMode} labels={labels} />
            </details>
        </li>
    );
}

export function RatingTable({
    entries,
    trailingEntry,
    currentUserId,
    showWinner,
    labels,
}: RatingTableProps) {
    return (
        <div className="mt-5">
            <div
                className={[
                    GRID_CLASS_NAME,
                    'border-b border-border px-1 pb-2 font-mono text-2xs font-medium uppercase tracking-[0.1em] text-muted',
                ].join(' ')}
                aria-hidden
            >
                <span>#</span>
                <span>{labels.player}</span>
                <span className="text-right">{labels.colGames}</span>
                <span className="text-right">{labels.score}</span>
            </div>
            <ol>
                {entries.map((entry) => (
                    <RatingRow
                        key={entry.userId}
                        entry={entry}
                        isMine={entry.userId === currentUserId}
                        isWinner={showWinner && entry.rank === 1}
                        labels={labels}
                    />
                ))}
                {trailingEntry ? (
                    <>
                        <li
                            className="border-b border-border py-1.5 text-center font-mono text-xs text-muted"
                            aria-label={labels.skippedPlaces}
                        >
                            · · ·
                        </li>
                        <RatingRow
                            entry={trailingEntry}
                            isMine
                            isWinner={false}
                            labels={labels}
                        />
                    </>
                ) : null}
            </ol>
        </div>
    );
}
