'use client';

/**
 * Общие куски экранов комнаты: надзаголовок, таблица мест со стрелками,
 * отметки ✓ / ✗ / – и сегменты прогресса. Статус не только цветом:
 * у стрелок есть знак, у отметок — значок (DESIGN.md, правило 3).
 */

import type { RoomStanding } from '@/features/quiz-room/lib/room-scoring';
import type { RoomMark, RoomPlayerDto } from '@/features/quiz-room/types';
import { UserAvatar } from '@/shared/ui';

export const EYEBROW_CLASS =
    'font-mono text-2xs font-medium uppercase tracking-[0.14em] text-muted';

const numberFormat = new Intl.NumberFormat('ru-RU');

export function formatRoomScore(score: number): string {
    return numberFormat.format(score);
}

export function RoomAvatar({ player, size = 'sm' }: { player: RoomPlayerDto; size?: 'sm' | 'base' }) {
    return <UserAvatar src={player.avatarUrl} pattern={player.avatarPattern} size={size} />;
}

function RankMove({ standing }: { standing: RoomStanding }) {
    if (standing.previousRank === null || standing.previousRank === standing.rank) {
        return <span className="w-7 font-mono text-2xs text-muted" aria-hidden>—</span>;
    }

    const up = standing.previousRank > standing.rank;
    const delta = Math.abs(standing.previousRank - standing.rank);

    return (
        <span className={`w-7 font-mono text-2xs ${up ? 'text-success' : 'text-danger'}`}>
            {up ? '▲' : '▼'}
            {delta}
        </span>
    );
}

type StandingsProps = {
    standings: RoomStanding[];
    players: RoomPlayerDto[];
    /** Показать прирост за последний вопрос (разбор). */
    showGain?: boolean;
    /** Подпись «N из M» верных (итоги). */
    correctLabel?: (correct: number) => string;
    /** Сколько строк показать (остальное — без меня не прячем). */
    limit?: number;
};

export function RoomStandings({ standings, players, showGain, correctLabel, limit }: StandingsProps) {
    const byId = new Map(players.map((player) => [player.id, player]));
    const visible = limit
        ? standings.filter(
              (row, index) => index < limit || byId.get(row.playerId)?.isMe,
          )
        : standings;

    return (
        <ol className="flex flex-col" data-testid="room-standings">
            {visible.map((row) => {
                const player = byId.get(row.playerId);

                if (!player) return null;

                return (
                    <li
                        key={row.playerId}
                        className={`flex min-h-11 items-center gap-2 border-b border-border px-2 py-1.5 text-sm last:border-b-0 ${
                            player.isMe ? 'rounded-md bg-primary/10' : ''
                        }`}
                    >
                        <span className="w-5 font-mono text-xs text-muted tabular-nums">{row.rank}</span>
                        {showGain ? <RankMove standing={row} /> : null}
                        <RoomAvatar player={player} />
                        <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                            {player.nickname}
                        </span>
                        {showGain && row.lastPoints > 0 ? (
                            <span className="font-mono text-2xs text-success tabular-nums">
                                +{formatRoomScore(row.lastPoints)}
                            </span>
                        ) : null}
                        {correctLabel ? (
                            <span className="font-mono text-2xs text-muted tabular-nums">
                                {correctLabel(row.correctCount)}
                            </span>
                        ) : null}
                        <span className="w-14 text-right font-mono text-sm font-semibold tabular-nums text-foreground">
                            {formatRoomScore(row.score)}
                        </span>
                    </li>
                );
            })}
        </ol>
    );
}

const MARK_VIEW: Record<RoomMark, { glyph: string; className: string }> = {
    correct: { glyph: '✓', className: 'bg-success text-surface' },
    wrong: { glyph: '✗', className: 'bg-danger text-surface' },
    missed: { glyph: '–', className: 'bg-surface-muted text-muted' },
};

export function RoomMarks({ marks, label }: { marks: RoomMark[]; label: string }) {
    return (
        <ol className="flex flex-wrap gap-1" aria-label={label}>
            {marks.map((mark, index) => (
                <li
                    key={index}
                    className={`flex size-5 items-center justify-center rounded-sm text-2xs font-bold ${MARK_VIEW[mark].className}`}
                >
                    {MARK_VIEW[mark].glyph}
                </li>
            ))}
        </ol>
    );
}

/** Сегменты прогресса: пройденные — по отметкам, текущий — тёмный. */
export function RoomProgress({
    total,
    marks,
    current,
}: {
    total: number;
    marks: RoomMark[];
    current: number;
}) {
    return (
        <div className="flex gap-0.5" aria-hidden>
            {Array.from({ length: total }, (_, index) => {
                const mark = marks[index];
                const tone =
                    index === current && !mark
                        ? 'bg-foreground'
                        : mark === 'correct'
                          ? 'bg-primary'
                          : mark === 'wrong'
                            ? 'bg-danger'
                            : mark === 'missed'
                              ? 'bg-muted/50'
                              : 'bg-surface-muted';

                return <span key={index} className={`h-1 flex-1 rounded-full ${tone}`} />;
            })}
        </div>
    );
}
