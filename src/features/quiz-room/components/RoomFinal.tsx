'use client';

/**
 * Итоги комнаты (макет v2, экраны 5–6): место игрока, подиум выезжает по
 * очереди 3 → 2 → 1 (токены podium-*), победителю — конфетти; награды
 * раунда; остальные места; свои ✓ / ✗ / –; «Разбор: где ошибся» (по
 * кнопке, отдельным запросом); «Ещё раунд» у ведущего, у остальных — вход
 * в новый раунд в одно касание с тем же именем; «Поделиться», «На главную».
 * Всё движение — motion-safe.
 * Canon: docs/DECISIONS.md → Quiz room.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState, type CSSProperties } from 'react';

import { ShareActions } from '@/features/quiz/components/ShareActions';
import { joinRoomAction } from '@/features/quiz-room/actions/room-actions';
import {
    EYEBROW_CLASS,
    formatRoomScore,
    RoomAvatar,
    RoomMarks,
    RoomStandings,
} from '@/features/quiz-room/components/RoomParts';
import { postRoom } from '@/features/quiz-room/components/use-room-state';
import type { RoomAward } from '@/features/quiz-room/lib/room-awards';
import { fillRoomText, roomErrorMessage, roomSettingsLine } from '@/features/quiz-room/lib/room-labels';
import type { RoomStanding } from '@/features/quiz-room/lib/room-scoring';
import type {
    RoomErrorCode,
    RoomPlayerDto,
    RoomReviewItemDto,
    RoomStateDto,
} from '@/features/quiz-room/types';
import { SITE_ORIGIN } from '@/shared/config/site';
import { formatPlural, getDictionary, type Dictionary, type Locale } from '@/shared/i18n';
import { Button, buttonClassName, InlineAlert, SubmitButton } from '@/shared/ui';

const PODIUM_STYLE: Record<1 | 2 | 3, string> = {
    1: 'h-36 bg-podium-gold text-podium-gold-fg',
    2: 'h-28 bg-podium-silver text-podium-silver-fg',
    3: 'h-24 bg-podium-bronze text-podium-bronze-fg',
};
/** Подиум выезжает по очереди: третий, второй, первый. */
const PODIUM_DELAY_MS: Record<1 | 2 | 3, number> = { 3: 0, 2: 350, 1: 700 };

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
        <div
            className="flex min-w-0 flex-col items-center gap-1.5 motion-safe:animate-podium-rise"
            style={{ animationDelay: `${PODIUM_DELAY_MS[place]}ms` }}
        >
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

/** Конфетти победителю: CSS-кусочки цветов токенов, один проход, без JS. */
function Confetti() {
    const pieces = Array.from({ length: 28 }, (_, index) => index);
    const tones = ['bg-primary', 'bg-podium-gold', 'bg-danger', 'bg-info', 'bg-warning', 'bg-success'];

    return (
        <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-30 h-0 overflow-visible motion-reduce:hidden">
            {pieces.map((index) => {
                const style: CSSProperties = {
                    left: `${(index * 37) % 100}%`,
                    animationDelay: `${(index % 7) * 120}ms`,
                    width: index % 3 === 0 ? 8 : 6,
                    height: index % 2 === 0 ? 12 : 8,
                };

                return (
                    <span
                        key={index}
                        style={style}
                        className={`absolute top-0 rounded-sm motion-safe:animate-confetti-fall ${tones[index % tones.length]}`}
                    />
                );
            })}
        </div>
    );
}

function AwardIcon({ kind }: { kind: RoomAward['kind'] }) {
    const paths: Record<RoomAward['kind'], string[]> = {
        fastest: ['M13 3L5 13h6l-1 8 8-10h-6l1-8Z'],
        sniper: ['M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M12 2v4M12 18v4M2 12h4M18 12h4'],
        climb: ['M4 18l6-6 4 4 6-8', 'M15 8h5v5'],
    };

    return (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {paths[kind].map((d) => (
                    <path key={d} d={d} />
                ))}
            </svg>
        </span>
    );
}

function awardText(
    award: RoomAward,
    name: string,
    dictionary: Dictionary,
    locale: Locale,
    questionTotal: number,
): { title: string; hint: string } {
    const text = dictionary.room;

    switch (award.kind) {
        case 'fastest':
            return {
                title: fillRoomText(text.awardFastest, { name }),
                hint: fillRoomText(text.awardFastestHint, {
                    seconds: (award.averageMs / 1000).toLocaleString(locale, { maximumFractionDigits: 1 }),
                }),
            };
        case 'sniper':
            return {
                title: fillRoomText(text.awardSniper, { name }),
                hint: fillRoomText(text.awardSniperHint, { correct: award.correct, total: questionTotal }),
            };
        case 'climb':
            return {
                title: fillRoomText(text.awardClimb, { name }),
                hint: formatPlural(locale, award.places, text.awardClimbHint),
            };
    }
}

/** Разбор ошибок — грузится один раз, по раскрытию. */
function RoomReview({ locale, code, missed }: { locale: Locale; code: string; missed: number }) {
    const dictionary = getDictionary(locale);
    const text = dictionary.room;
    const [items, setItems] = useState<RoomReviewItemDto[] | null>(null);
    const [failed, setFailed] = useState(false);

    async function load() {
        if (items) return;

        try {
            const response = await fetch(`/api/room/${code}/review?locale=${locale}`, { cache: 'no-store' });
            if (!response.ok) throw new Error(String(response.status));
            const data = (await response.json()) as { items: RoomReviewItemDto[] };
            setItems(data.items);
        } catch {
            setFailed(true);
        }
    }

    if (missed === 0) {
        return (
            <p className="rounded-lg border border-border bg-surface p-4 text-sm text-foreground shadow-sm">
                {text.reviewPerfect}
            </p>
        );
    }

    return (
        <details
            className="group rounded-lg border border-border bg-surface shadow-sm"
            onToggle={(event) => {
                if ((event.currentTarget as HTMLDetailsElement).open) void load();
            }}
        >
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                <span className="font-semibold text-foreground">{text.reviewTitle}</span>
                <span className="flex items-center gap-1 font-mono text-xs text-muted">
                    {formatPlural(locale, missed, text.reviewCount)}
                    <svg viewBox="0 0 24 24" className="size-4 motion-safe:transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                        <path d="M9 6l6 6-6 6" />
                    </svg>
                </span>
            </summary>
            <div className="flex flex-col gap-2 border-t border-border p-3">
                {failed ? <p className="text-sm text-danger">{text.errors.generic}</p> : null}
                {!items && !failed ? <div className="h-16 animate-pulse rounded-md bg-surface-muted" aria-hidden /> : null}
                {items?.map((item) => (
                    <article key={item.position} className="rounded-md bg-surface-muted p-3 text-sm">
                        <p className="font-medium text-foreground">
                            <span className="mr-1.5 font-mono text-xs text-muted">{item.position + 1}.</span>
                            {item.text}
                        </p>
                        <p className="mt-1 text-danger">
                            {item.myAnswer ? fillRoomText(text.reviewYour, { answer: item.myAnswer }) : text.reviewMissed}
                        </p>
                        <p className="text-success">{fillRoomText(text.reviewRight, { answer: item.rightAnswer })}</p>
                    </article>
                ))}
            </div>
        </details>
    );
}

/** Вход в новый раунд в одно касание с тем же именем. */
function RematchJoin({
    locale,
    state,
    nickname,
    hostName,
}: {
    locale: Locale;
    state: RoomStateDto;
    nickname: string;
    hostName: string;
}) {
    const dictionary = getDictionary(locale);
    const text = dictionary.room;
    const [formState, formAction] = useActionState(joinRoomAction, {});
    const roomUrl = formState.roomUrl;
    const errorMessage = roomErrorMessage(dictionary, formState.errorCode);

    useEffect(() => {
        // Полная загрузка страницы новой комнаты (как обычный вход).
        if (roomUrl) window.location.assign(roomUrl);
    }, [roomUrl]);

    return (
        <form
            action={formAction}
            className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/10 p-4"
        >
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="code" value={state.nextRoomCode ?? ''} />
            <input type="hidden" name="nickname" value={nickname} />
            <p className="font-medium text-foreground">{fillRoomText(text.rematchReady, { name: hostName })}</p>
            <p className="font-mono text-xs text-muted">
                {fillRoomText(text.rematchInfo, {
                    settings: roomSettingsLine(dictionary, locale, state.settings),
                    players: formatPlural(locale, state.nextRoomPlayers ?? 1, text.playersCount),
                })}
            </p>
            <SubmitButton
                pendingLabel={dictionary.common.working}
                disabled={Boolean(roomUrl)}
                className="w-full"
                data-testid="room-rematch-join"
            >
                {fillRoomText(text.rematchJoinAs, { name: nickname })}
            </SubmitButton>
            {errorMessage ? <InlineAlert>{errorMessage}</InlineAlert> : null}
        </form>
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
    const missed = state.myMarks.length - correct;
    const questionTotal = state.schedule.length;
    // Подиум 2-1-3: победитель в центре.
    const podiumOrder = [podium[1], podium[0], podium[2]];
    const isWinner = mine?.rank === 1;

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
            {isWinner ? <Confetti /> : null}
            <div>
                <p className={EYEBROW_CLASS}>
                    {text.results} · {state.code}
                </p>
                {mine ? (
                    <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-foreground">
                        {isWinner ? text.winner : fillRoomText(text.place, { place: mine.rank, total })}
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

            {state.awards.length > 0 ? (
                <section className="flex flex-col gap-2" data-testid="room-awards">
                    <h2 className={EYEBROW_CLASS}>{text.awardsTitle}</h2>
                    {state.awards.map((award) => {
                        const player = byId.get(award.playerId);

                        if (!player) return null;

                        const view = awardText(award, player.nickname, dictionary, locale, questionTotal);

                        return (
                            <div
                                key={award.kind}
                                className={`flex items-center gap-3 rounded-lg border bg-surface p-3 shadow-sm ${player.isMe ? 'border-primary/50' : 'border-border'}`}
                            >
                                <AwardIcon kind={award.kind} />
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-foreground">{view.title}</p>
                                    <p className="text-xs text-muted">{view.hint}</p>
                                </div>
                            </div>
                        );
                    })}
                </section>
            ) : null}

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

            {state.status === 'finished' ? (
                <RoomReview locale={locale} code={state.code} missed={missed} />
            ) : null}

            {error ? <InlineAlert>{roomErrorMessage(dictionary, error)}</InlineAlert> : null}

            {state.isHost ? (
                <Button
                    onClick={rematch}
                    disabled={busy}
                    aria-busy={busy || undefined}
                    className="min-h-12 w-full text-base"
                    data-testid="room-rematch"
                >
                    {busy ? dictionary.common.working : text.rematch}
                </Button>
            ) : state.nextRoomCode && state.me ? (
                <RematchJoin
                    locale={locale}
                    state={state}
                    nickname={state.me.nickname}
                    hostName={host?.nickname ?? ''}
                />
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
