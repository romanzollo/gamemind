'use client';

/**
 * Итоги комнаты (экран 9 макета): место игрока, подиум на медалях рейтинга
 * (токены podium-*), остальные, свои отметки ✓ / ✗ / –, «Ещё раунд» у
 * ведущего (новая комната с теми же настройками) и вход в неё у остальных,
 * «Поделиться», «На главную».
 * Canon: docs/DECISIONS.md → Quiz room.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ShareActions } from '@/features/quiz/components/ShareActions';
import {
    EYEBROW_CLASS,
    formatRoomScore,
    RoomAvatar,
    RoomMarks,
    RoomStandings,
} from '@/features/quiz-room/components/RoomParts';
import { postRoom } from '@/features/quiz-room/components/use-room-state';
import { fillRoomText, roomErrorMessage } from '@/features/quiz-room/lib/room-labels';
import type { RoomStanding } from '@/features/quiz-room/lib/room-scoring';
import type { RoomErrorCode, RoomPlayerDto, RoomStateDto } from '@/features/quiz-room/types';
import { SITE_ORIGIN } from '@/shared/config/site';
import { getDictionary, type Locale } from '@/shared/i18n';
import { Button, buttonClassName, InlineAlert } from '@/shared/ui';

const PODIUM_STYLE: Record<1 | 2 | 3, string> = {
    1: 'h-36 bg-podium-gold text-podium-gold-fg',
    2: 'h-28 bg-podium-silver text-podium-silver-fg',
    3: 'h-24 bg-podium-bronze text-podium-bronze-fg',
};

function PodiumStep({
    standing,
    player,
    place,
}: {
    standing: RoomStanding;
    player: RoomPlayerDto;
    place: 1 | 2 | 3;
}) {
    return (
        <div className="flex min-w-0 flex-col items-center gap-1.5">
            <RoomAvatar player={player} size="base" />
            <div
                className={`flex w-full flex-col items-center justify-start rounded-t-lg rounded-b-sm px-1 pt-2 ${PODIUM_STYLE[place]}`}
            >
                <span className="font-display text-3xl font-bold leading-none">{standing.rank}</span>
                <span className="mt-1 w-full truncate text-center text-xs font-semibold">
                    {player.nickname}
                </span>
                <span className="font-mono text-2xs tabular-nums">{formatRoomScore(standing.score)}</span>
            </div>
        </div>
    );
}

export function RoomFinal({ locale, state }: { locale: Locale; state: RoomStateDto }) {
    const router = useRouter();
    const dictionary = getDictionary(locale);
    const text = dictionary.room;
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<RoomErrorCode | null>(null);
    const byId = new Map(state.players.map((player) => [player.id, player]));
    const total = state.players.length;
    const mine = state.standings.find((row) => byId.get(row.playerId)?.isMe);
    const host = state.players.find((player) => player.isHost);
    const podium = state.standings.slice(0, 3);
    const rest = state.standings.slice(3);
    const correct = state.myMarks.filter((mark) => mark === 'correct').length;
    const questionTotal = state.schedule.length;
    // Подиум 2-1-3: победитель в центре.
    const podiumOrder = [podium[1], podium[0], podium[2]];

    async function rematch() {
        setBusy(true);
        setError(null);

        const result = await postRoom(`/api/room/${state.code}/host`, { op: 'rematch' });

        if (result.ok && typeof result.data.nextRoomCode === 'string') {
            router.push(`/${locale}/room/${result.data.nextRoomCode}`);
            return;
        }

        setBusy(false);
        setError(result.ok ? 'RETRY' : (result.error as RoomErrorCode));
    }

    const shareText = mine
        ? fillRoomText(text.shareResult, {
              code: state.code,
              place: mine.rank,
              total,
              score: formatRoomScore(mine.score),
          })
        : '';

    return (
        <div className="flex flex-col gap-4" data-testid="room-final">
            <div>
                <p className={EYEBROW_CLASS}>
                    {text.results} · {state.code}
                </p>
                {mine ? (
                    <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-foreground">
                        {mine.rank === 1
                            ? text.winner
                            : fillRoomText(text.place, { place: mine.rank, total })}
                    </h1>
                ) : null}
            </div>

            <div className="grid grid-cols-3 items-end gap-2">
                {podiumOrder.map((standing, index) => {
                    const player = standing ? byId.get(standing.playerId) : undefined;
                    const place = ([2, 1, 3] as const)[index]!;

                    return standing && player ? (
                        <PodiumStep key={standing.playerId} standing={standing} player={player} place={place} />
                    ) : (
                        <div key={`empty-${place}`} aria-hidden />
                    );
                })}
            </div>

            {rest.length > 0 ? (
                <section className="rounded-lg border border-border bg-surface p-2 shadow-sm">
                    <RoomStandings
                        standings={rest}
                        players={state.players}
                        correctLabel={(count) =>
                            fillRoomText(text.correctOf, { correct: count, total: questionTotal })
                        }
                    />
                </section>
            ) : null}

            {state.myMarks.length > 0 ? (
                <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
                    <h2 className={`${EYEBROW_CLASS} mb-2`}>
                        {fillRoomText(text.yourAnswers, { correct, total: questionTotal })}
                    </h2>
                    <RoomMarks marks={state.myMarks} label={text.yourAnswers} />
                </section>
            ) : null}

            {error ? <InlineAlert>{roomErrorMessage(dictionary, error)}</InlineAlert> : null}

            {state.isHost ? (
                <Button onClick={rematch} disabled={busy} aria-busy={busy || undefined} className="w-full" data-testid="room-rematch">
                    {busy ? dictionary.common.working : text.rematch}
                </Button>
            ) : state.nextRoomCode ? (
                <div className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/10 p-4 text-center">
                    <p className="font-medium text-foreground">
                        {fillRoomText(text.rematchReady, { name: host?.nickname ?? '' })}
                    </p>
                    <Link
                        href={`/${locale}/room/${state.nextRoomCode}`}
                        className={buttonClassName({ className: 'w-full' })}
                        data-testid="room-rematch-join"
                    >
                        {text.rematchJoin}
                    </Link>
                </div>
            ) : (
                <p className="text-center text-sm text-muted">
                    {fillRoomText(text.waitingRematch, { name: host?.nickname ?? '' })}
                </p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
                {mine ? (
                    <ShareActions
                        text={shareText}
                        targets={{
                            telegram: `https://t.me/share/url?url=${encodeURIComponent(SITE_ORIGIN)}&text=${encodeURIComponent(shareText)}`,
                            vk: `https://vk.com/share.php?url=${encodeURIComponent(SITE_ORIGIN)}&title=${encodeURIComponent(shareText)}`,
                            max: `https://max.ru/:share?text=${encodeURIComponent(shareText)}`,
                        }}
                        labels={{
                            button: text.share,
                            copied: dictionary.share.copied,
                            copyFailed: dictionary.share.copyFailed,
                        }}
                        shareWhat="room"
                        className="w-full sm:flex-1"
                    />
                ) : null}
                <Link
                    href={`/${locale}`}
                    className={buttonClassName({ variant: 'secondary', className: 'w-full sm:flex-1' })}
                >
                    {text.home}
                </Link>
            </div>
        </div>
    );
}
