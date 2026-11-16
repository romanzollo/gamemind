'use client';

/**
 * Итоги комнаты (макет v3, экраны 3–5).
 *
 * Постановка ~6 с, чтобы успеть насладиться моментом: пауза → 3-е место →
 * 2-е → пауза-интрига «?» на 1-й ступени → победитель (конфетти, если это
 * ты) → плашка про тебя (отрыв / «не хватило всего 120 очков») → награды
 * по одной → таблица компании и счёт встреч. Касание — показать сразу;
 * при «меньше движения» — всё сразу.
 *
 * Ниже: свои ✓ / ✗ / –, «Разбор: где ошибся», «Ещё раунд» у ведущего
 * («Отыграться», если не победил), вход в новый раунд в одно касание у
 * остальных, «Поделиться» (текст по месту, ссылка на страницу итогов).
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
import {
    ROOM_AWARD_EMOJI,
    RoomAwardIcon,
    roomAwardText,
} from '@/features/quiz-room/components/room-award-view';
import { postRoom } from '@/features/quiz-room/components/use-room-state';
import { fillRoomText, roomErrorMessage, roomSettingsLine } from '@/features/quiz-room/lib/room-labels';
import type { RoomStanding } from '@/features/quiz-room/lib/room-scoring';
import { buildRoomResultShare } from '@/features/quiz-room/lib/room-share';
import type {
    RoomErrorCode,
    RoomLeagueDto,
    RoomPlayerDto,
    RoomReviewItemDto,
    RoomStateDto,
} from '@/features/quiz-room/types';
import { formatPlural, getDictionary, type Locale } from '@/shared/i18n';
import { Button, buttonClassName, InlineAlert, SubmitButton } from '@/shared/ui';

const PODIUM_STYLE: Record<1 | 2 | 3, string> = {
    1: 'h-36 bg-podium-gold text-podium-gold-fg',
    2: 'h-28 bg-podium-silver text-podium-silver-fg',
    3: 'h-24 bg-podium-bronze text-podium-bronze-fg',
};

/**
 * Шаги постановки и когда они наступают (мс от открытия итогов):
 * 1 — 3-е место, 2 — 2-е, 3 — «?» на 1-й ступени, 4 — победитель,
 * 5 — плашка про тебя, 6+ — награды по одной.
 */
const STAGE_AT = [0, 600, 2_000, 3_600, 4_400, 5_600];
const AWARD_STEP_MS = 500;
/** Разрыв, при котором «не хватило всего … — один быстрый ответ!». */
const CLOSE_GAP_POINTS = 300;

function prefersReducedMotion(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Шаг постановки; `skip()` — показать всё сразу. */
function useFinalStage(totalStages: number): { stage: number; skip: () => void } {
    const [stage, setStage] = useState(0);

    useEffect(() => {
        if (prefersReducedMotion()) {
            const id = setTimeout(() => setStage(totalStages), 0);
            return () => clearTimeout(id);
        }

        const timers = Array.from({ length: totalStages }, (_, index) => {
            const step = index + 1;
            const at =
                STAGE_AT[step] ?? STAGE_AT[STAGE_AT.length - 1]! + (step - (STAGE_AT.length - 1)) * AWARD_STEP_MS;

            return setTimeout(() => setStage((current) => Math.max(current, step)), at);
        });

        return () => timers.forEach(clearTimeout);
    }, [totalStages]);

    return { stage, skip: () => setStage(totalStages) };
}

function PodiumStep({
    standing,
    player,
    place,
    visible,
    mystery,
}: {
    standing: RoomStanding;
    player: RoomPlayerDto;
    place: 1 | 2 | 3;
    visible: boolean;
    /** 1-я ступень уже стоит, но имя — «?» (пауза-интрига). */
    mystery: boolean;
}) {
    return (
        <div
            className={`flex min-w-0 flex-col items-center gap-1.5 ${visible ? 'motion-safe:animate-podium-rise' : 'invisible'}`}
            aria-hidden={!visible || mystery}
        >
            <div className={mystery ? 'invisible' : 'motion-safe:animate-room-pop'}>
                <RoomAvatar player={player} size="base" />
            </div>
            <div
                className={`flex w-full flex-col items-center justify-start rounded-t-lg rounded-b-sm px-1 pt-2 ${PODIUM_STYLE[place]}`}
            >
                <span className="font-display text-3xl font-bold leading-none">{mystery ? '?' : standing.rank}</span>
                {mystery ? null : (
                    <>
                        <span className="mt-1 w-full truncate text-center text-xs font-semibold motion-safe:animate-room-pop">
                            {player.nickname}
                        </span>
                        <span className="font-mono text-2xs tabular-nums">{formatRoomScore(standing.score)}</span>
                    </>
                )}
            </div>
        </div>
    );
}

/** Конфетти победителю: CSS-кусочки цветов токенов, один проход, без JS. */
function Confetti() {
    const tones = ['bg-primary', 'bg-podium-gold', 'bg-danger', 'bg-info', 'bg-warning', 'bg-success'];

    return (
        <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-30 h-0 overflow-visible motion-reduce:hidden">
            {Array.from({ length: 32 }, (_, index) => {
                const style: CSSProperties = {
                    left: `${(index * 37) % 100}%`,
                    animationDelay: `${(index % 8) * 140}ms`,
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

/** Таблица компании и счёт встреч — грузятся один раз после постановки. */
function RoomLeague({ locale, state }: { locale: Locale; state: RoomStateDto }) {
    const dictionary = getDictionary(locale);
    const text = dictionary.room;
    const [league, setLeague] = useState<RoomLeagueDto | null>(null);

    useEffect(() => {
        let cancelled = false;

        fetch(`/api/room/${state.code}/league`, { cache: 'no-store' })
            .then((response) => (response.ok ? response.json() : null))
            .then((data: RoomLeagueDto | null) => {
                if (!cancelled && data) setLeague(data);
            })
            .catch(() => undefined);

        return () => {
            cancelled = true;
        };
    }, [state.code]);

    if (!league || league.league.length === 0) {
        return null;
    }

    const byId = new Map(state.players.map((player) => [player.id, player]));
    const winners = new Set(state.standings.filter((row) => row.rank === 1).map((row) => row.playerId));

    return (
        <>
            <section className="rounded-lg border border-border bg-surface p-4 shadow-sm motion-safe:animate-fact-in" data-testid="room-league">
                <div className="flex items-baseline justify-between gap-3">
                    <h2 className="font-display text-lg font-semibold text-foreground">{text.leagueTitle}</h2>
                    <span className="font-mono text-2xs text-muted">{text.leaguePeriod}</span>
                </div>
                <p className="mb-2 text-xs text-muted">{text.leagueHint}</p>
                <ol className="flex flex-col">
                    {league.league.map((row, index) => {
                        const player = byId.get(row.playerId);
                        if (!player) return null;

                        return (
                            <li
                                key={row.playerId}
                                className={`flex min-h-11 items-center gap-2 border-b border-border px-2 py-1.5 text-sm last:border-b-0 ${player.isMe ? 'rounded-md bg-primary/10' : ''}`}
                            >
                                <span className="w-5 font-mono text-xs text-muted tabular-nums">{index + 1}</span>
                                <RoomAvatar player={player} />
                                {/* Метка новой победы — под именем: в одну строку на телефоне
                                    она съедала либо себя, либо имя. */}
                                <span className="flex min-w-0 flex-1 flex-col items-start">
                                    <span className="w-full truncate font-medium text-foreground">{player.nickname}</span>
                                    {winners.has(row.playerId) ? (
                                        <span className="mt-0.5 rounded-full bg-success-muted px-2 py-0.5 font-mono text-2xs whitespace-nowrap text-success">
                                            {text.leagueNewWin}
                                        </span>
                                    ) : null}
                                </span>
                                <span className="font-mono text-xs font-semibold text-foreground tabular-nums">
                                    {formatPlural(locale, row.wins, text.leagueWins)}
                                </span>
                                <span className="w-16 text-right font-mono text-2xs text-muted tabular-nums">
                                    {formatPlural(locale, row.games, text.leagueGames)}
                                </span>
                            </li>
                        );
                    })}
                </ol>
            </section>

            {league.headToHead.length > 0 ? (
                <section className="rounded-lg border border-border bg-surface p-4 shadow-sm motion-safe:animate-fact-in" data-testid="room-h2h">
                    <h2 className="mb-1 font-display text-lg font-semibold text-foreground">{text.h2hTitle}</h2>
                    <ul className="flex flex-col">
                        {league.headToHead.map((row) => {
                            const player = byId.get(row.playerId);
                            if (!player) return null;
                            const tone =
                                row.myWins > row.theirWins
                                    ? 'text-success'
                                    : row.myWins < row.theirWins
                                      ? 'text-danger'
                                      : 'text-foreground';

                            return (
                                <li key={row.playerId} className="flex min-h-11 items-center justify-between gap-3 border-b border-border text-sm last:border-b-0">
                                    <span className="truncate text-foreground">
                                        {fillRoomText(text.h2hRow, { name: player.nickname })}
                                    </span>
                                    <span className={`font-display text-xl font-bold tabular-nums ${tone}`}>
                                        {row.myWins} : {row.theirWins}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            ) : null}
        </>
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
        <form action={formAction} className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/10 p-4">
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
    const [origin, setOrigin] = useState('');
    const byId = new Map(state.players.map((player) => [player.id, player]));
    const total = state.players.length;
    const mine = state.standings.find((row) => byId.get(row.playerId)?.isMe);
    const host = state.players.find((player) => player.isHost);
    const podium = state.standings.slice(0, 3);
    const rest = state.standings.slice(3);
    const correct = state.myMarks.filter((mark) => mark === 'correct').length;
    const missed = state.myMarks.length - correct;
    const questionTotal = state.schedule.length;
    const isWinner = mine?.rank === 1;
    const totalStages = STAGE_AT.length - 1 + state.awards.length;
    const { stage, skip } = useFinalStage(totalStages);
    const settled = stage >= totalStages;

    useEffect(() => {
        const id = requestAnimationFrame(() => setOrigin(window.location.origin));
        return () => cancelAnimationFrame(id);
    }, []);

    // Плашка про тебя: отрыв победителю, «не хватило» остальным.
    const leader = state.standings[0];
    const second = state.standings.find((row) => row.playerId !== mine?.playerId && mine && row.rank >= mine.rank);
    const tieForFirst = isWinner && state.standings.filter((row) => row.rank === 1).length > 1;
    const points = (value: number) => formatPlural(locale, value, text.points);
    const gapLine = !mine
        ? null
        : tieForFirst
          ? { tone: 'win', text: text.finalTieWin }
          : isWinner
            ? second
                ? { tone: 'win', text: fillRoomText(text.finalWinGap, { points: points(mine.score - second.score) }) }
                : null
            : leader
              ? leader.score - mine.score <= CLOSE_GAP_POINTS
                  ? { tone: 'close', text: fillRoomText(text.finalCloseGap, { points: points(leader.score - mine.score) }) }
                  : { tone: 'far', text: fillRoomText(text.finalFarGap, { points: points(leader.score - mine.score) }) }
              : null;

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

    const myAward = state.awards.find((award) => award.playerId === mine?.playerId);
    const share = mine
        ? buildRoomResultShare(
              {
                  code: state.code,
                  place: mine.rank,
                  total,
                  marks: state.myMarks,
                  score: points(mine.score),
                  award: myAward
                      ? `${ROOM_AWARD_EMOJI[myAward.kind]} ${text.awards[myAward.kind].title}`
                      : null,
                  lead:
                      isWinner && second
                          ? { name: byId.get(second.playerId)?.nickname ?? '', points: points(mine.score - second.score) }
                          : null,
                  gap: !isWinner && leader ? points(leader.score - mine.score) : null,
                  url: `${origin}/${locale}/room/${state.code}/results`,
              },
              {
                  win: text.shareWin,
                  silver: text.shareSilver,
                  bronze: text.shareBronze,
                  place: text.sharePlace,
                  score: text.shareScore,
                  lead: text.shareLead,
                  gap: text.shareGap,
                  cta: text.shareCta,
              },
          )
        : null;

    return (
        <div className="flex flex-col gap-4" data-testid="room-final" data-settled={settled}>
            {isWinner && stage >= 4 ? <Confetti /> : null}
            <div>
                <p className={EYEBROW_CLASS}>
                    {text.results} · {state.code}
                </p>
                {mine && stage >= 4 ? (
                    <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-foreground motion-safe:animate-room-pop">
                        {isWinner ? text.winner : fillRoomText(text.place, { place: mine.rank, total })}
                    </h1>
                ) : (
                    <div className="mt-1 h-8" aria-hidden />
                )}
            </div>

            <div
                className="relative grid cursor-pointer grid-cols-3 items-end gap-2"
                onClick={skip}
                role="presentation"
            >
                {([2, 1, 3] as const).map((place) => {
                    const standing = podium[place - 1];
                    const player = standing ? byId.get(standing.playerId) : undefined;
                    const visible = place === 3 ? stage >= 1 : place === 2 ? stage >= 2 : stage >= 3;

                    return standing && player ? (
                        <PodiumStep
                            key={standing.playerId}
                            standing={standing}
                            player={player}
                            place={place}
                            visible={visible}
                            mystery={place === 1 && stage < 4}
                        />
                    ) : (
                        <div key={`empty-${place}`} aria-hidden />
                    );
                })}
            </div>
            {!settled ? (
                <button
                    type="button"
                    onClick={skip}
                    className="-mt-2 min-h-11 cursor-pointer self-center font-mono text-2xs text-muted underline decoration-dotted underline-offset-2"
                >
                    {text.skipAnimation}
                </button>
            ) : null}

            {gapLine && stage >= 5 ? (
                <p
                    className={`rounded-lg border px-3 py-2.5 text-center text-sm text-foreground motion-safe:animate-room-pop ${
                        gapLine.tone === 'win'
                            ? 'border-success/40 bg-success-muted'
                            : gapLine.tone === 'close'
                              ? 'border-warning/40 bg-warning-muted'
                              : 'border-border bg-surface'
                    }`}
                    data-testid="room-gap"
                >
                    {gapLine.text}
                </p>
            ) : null}

            {state.awards.length > 0 && stage >= 6 ? (
                <section className="flex flex-col gap-2" data-testid="room-awards">
                    <h2 className={EYEBROW_CLASS}>{text.awardsTitle}</h2>
                    <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                        {state.awards.slice(0, Math.max(0, stage - 5)).map((award) => {
                            const player = byId.get(award.playerId);
                            if (!player) return null;
                            const view = roomAwardText(award, player.nickname, dictionary, locale, questionTotal);

                            return (
                                <div
                                    key={award.kind}
                                    className={`flex items-center gap-3 rounded-lg border bg-surface p-3 shadow-sm motion-safe:animate-room-pop ${player.isMe ? 'border-primary/50' : 'border-border'}`}
                                >
                                    <RoomAwardIcon kind={award.kind} />
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-foreground">{view.title}</p>
                                        <p className="text-xs text-muted">{view.hint}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            ) : null}

            {settled ? (
                <>
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

                    {state.status === 'finished' ? <RoomLeague locale={locale} state={state} /> : null}

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
                </>
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
                    {busy ? dictionary.common.working : isWinner ? text.rematch : text.rematchRevenge}
                </Button>
            ) : state.nextRoomCode && state.me ? (
                <RematchJoin locale={locale} state={state} nickname={state.me.nickname} hostName={host?.nickname ?? ''} />
            ) : (
                <p className="text-center text-sm text-muted">
                    {fillRoomText(text.waitingRematch, { name: host?.nickname ?? '' })}
                </p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
                {share && origin ? (
                    <ShareActions
                        text={share.text}
                        targets={share.targets}
                        labels={{
                            button: text.share,
                            copied: dictionary.share.copied,
                            copyFailed: dictionary.share.copyFailed,
                        }}
                        shareWhat="room"
                        className="w-full sm:flex-1"
                    />
                ) : null}
                <Link href={`/${locale}`} className={buttonClassName({ variant: 'secondary', className: 'w-full sm:flex-1' })}>
                    {text.home}
                </Link>
            </div>
        </div>
    );
}
