/**
 * Публичные итоги комнаты `/room/{КОД}/results` — сюда ведёт «Поделиться»
 * из итогов. Видны всем без входа: подиум, остальные места, награды и
 * призыв «Собрать свою комнату» (крючок для того, кто увидел ссылку).
 * Отдельный адрес, а не `/room/{КОД}`: Telegram кэширует превью по адресу,
 * и приглашение с итогами иначе перепутались бы.
 * Игра ещё идёт — на страницу комнаты; комнаты нет — мягкая страница с
 * вводом кода, без «липкого» notFound().
 * Canon: docs/DECISIONS.md → Quiz room (v3).
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { RoomAvatar, RoomStandings } from '@/features/quiz-room/components/RoomParts';
import { RoomAwardIcon, roomAwardText } from '@/features/quiz-room/components/room-award-view';
import { RoomEntry } from '@/features/quiz-room/components/RoomEntry';
import { normalizeRoomCode } from '@/features/quiz-room/lib/room-code';
import { fillRoomText } from '@/features/quiz-room/lib/room-labels';
import { readRoomState } from '@/features/quiz-room/server/room-service';
import type { RoomStateDto } from '@/features/quiz-room/types';
import { auth } from '@/lib/auth';
import { formatPlural, getDictionary, isLocale, type Locale } from '@/shared/i18n';
import { buttonClassName } from '@/shared/ui';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ResultsPageProps = {
    params: Promise<{ locale: string; code: string }>;
};

async function load(code: string | null, locale: Locale): Promise<RoomStateDto | null> {
    if (!code) return null;
    return readRoomState({ code, userId: null, locale }).catch(() => null);
}

/** «roman — 2-й, Хитрый Гоблин — 3-й» для описания превью. */
function othersLine(state: RoomStateDto, locale: Locale): string {
    const text = getDictionary(locale).room;
    const byId = new Map(state.players.map((player) => [player.id, player]));

    return state.standings
        .slice(1, 3)
        .map((row) =>
            fillRoomText(text.ogResultPlace, {
                name: byId.get(row.playerId)?.nickname ?? '',
                place: row.rank,
            }),
        )
        .join(', ');
}

export async function generateMetadata({ params }: ResultsPageProps): Promise<Metadata> {
    const { locale: rawLocale, code: rawCode } = await params;
    const locale = isLocale(rawLocale) ? rawLocale : 'ru';
    const text = getDictionary(locale).room;
    const code = normalizeRoomCode(rawCode);
    const state = await load(code, locale);
    const winner = state?.players.find((player) => player.id === state.standings[0]?.playerId);

    if (!state || state.status !== 'finished' || !winner) {
        return { robots: { index: false } };
    }

    const title = fillRoomText(text.ogResultTitle, { name: winner.nickname, code: state.code });
    const description = fillRoomText(text.ogResultDesc, { others: othersLine(state, locale) });

    return {
        title,
        description,
        robots: { index: false },
        openGraph: { title, description, siteName: 'GameMind', type: 'website' },
    };
}

const PODIUM_STYLE: Record<1 | 2 | 3, string> = {
    1: 'h-36 bg-podium-gold text-podium-gold-fg',
    2: 'h-28 bg-podium-silver text-podium-silver-fg',
    3: 'h-24 bg-podium-bronze text-podium-bronze-fg',
};

export default async function RoomResultsPage({ params }: ResultsPageProps) {
    const { locale: rawLocale, code: rawCode } = await params;
    const locale = isLocale(rawLocale) ? rawLocale : 'ru';
    const dictionary = getDictionary(locale);
    const text = dictionary.room;
    const code = normalizeRoomCode(rawCode);

    if (code && code !== rawCode) {
        redirect(`/${locale}/room/${code}/results`);
    }

    const state = await load(code, locale);

    if (!state || !code) {
        const session = await auth();
        const canCreate = Boolean(session?.user?.id) && session?.user?.isGuest !== true;

        return (
            <main className="mx-auto max-w-md px-4 py-6 sm:py-10">
                <div className="rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-6">
                    <RoomEntry locale={locale} canCreate={canCreate} codeError={text.errors.notFound} initialCode={rawCode} />
                </div>
            </main>
        );
    }

    if (state.status !== 'finished') {
        redirect(`/${locale}/room/${code}`);
    }

    const byId = new Map(state.players.map((player) => [player.id, player]));
    const questionTotal = state.schedule.length;

    return (
        <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-6 sm:py-10" data-testid="room-results-public">
            <div>
                <p className="font-mono text-2xs font-medium uppercase tracking-[0.14em] text-muted">
                    {text.results} · {state.code}
                </p>
                <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-foreground">
                    {fillRoomText(text.resultsPublicTitle, { code: state.code })}
                </h1>
                <p className="mt-1 font-mono text-xs text-muted">
                    {formatPlural(locale, state.players.length, text.playersCount)} ·{' '}
                    {formatPlural(locale, questionTotal, text.questions)}
                </p>
            </div>

            <div className="grid grid-cols-3 items-end gap-2">
                {([2, 1, 3] as const).map((place) => {
                    const standing = state.standings[place - 1];
                    const player = standing ? byId.get(standing.playerId) : undefined;

                    return standing && player ? (
                        <div key={standing.playerId} className="flex min-w-0 flex-col items-center gap-1.5">
                            <RoomAvatar player={player} size="base" />
                            <div className={`flex w-full flex-col items-center rounded-t-lg rounded-b-sm px-1 pt-2 ${PODIUM_STYLE[place]}`}>
                                <span className="font-display text-3xl font-bold leading-none">{standing.rank}</span>
                                <span className="mt-1 w-full truncate text-center text-xs font-semibold">{player.nickname}</span>
                                <span className="font-mono text-2xs tabular-nums">{standing.score.toLocaleString('ru-RU')}</span>
                            </div>
                        </div>
                    ) : (
                        <div key={`empty-${place}`} aria-hidden />
                    );
                })}
            </div>

            {state.standings.length > 3 ? (
                <section className="rounded-lg border border-border bg-surface p-2 shadow-sm">
                    <RoomStandings standings={state.standings.slice(3)} players={state.players} />
                </section>
            ) : null}

            {state.awards.length > 0 ? (
                <section className="flex flex-col gap-2">
                    <h2 className="font-mono text-2xs font-medium uppercase tracking-[0.14em] text-muted">{text.awardsTitle}</h2>
                    <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                        {state.awards.map((award) => {
                            const player = byId.get(award.playerId);
                            if (!player) return null;
                            const view = roomAwardText(award, player.nickname, dictionary, locale, questionTotal);

                            return (
                                <div key={award.kind} className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3 shadow-sm">
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

            <Link href={`/${locale}/room`} className={buttonClassName({ className: 'min-h-12 w-full text-base' })} data-testid="room-results-cta">
                {text.resultsPublicCta}
            </Link>
        </main>
    );
}
