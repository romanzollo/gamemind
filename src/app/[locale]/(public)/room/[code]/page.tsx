/**
 * Страница комнаты `/room/{КОД}` — сюда ведут код и ссылка-приглашение.
 *
 * По зрителю:
 * - без сессии — кто зовёт и что за игра + «Играть без регистрации» / вход
 *   (оба возвращают сюда через `next`);
 * - вошёл, но не в комнате — имя в игре и «Войти в комнату» (только лобби);
 * - участник — живая комната (`RoomClient`, дальше опрос API).
 * Нет комнаты — мягкая страница с вводом кода, без «липкого» notFound().
 * Canon: docs/DECISIONS.md → Quiz room.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { RoomClient } from '@/features/quiz-room/components/RoomClient';
import { RoomEntry } from '@/features/quiz-room/components/RoomEntry';
import { RoomGuestGate, RoomJoinForm } from '@/features/quiz-room/components/RoomJoin';
import { normalizeRoomCode } from '@/features/quiz-room/lib/room-code';
import {
    fillRoomText,
    roomDifficultyLabel,
    roomErrorMessage,
    roomQuestionsLabel,
    roomSettingsLine,
} from '@/features/quiz-room/lib/room-labels';
import {
    generateRoomNickname,
    nicknameFromUsername,
} from '@/features/quiz-room/lib/room-nickname';
import { readRoomState } from '@/features/quiz-room/server/room-service';
import type { RoomStateDto } from '@/features/quiz-room/types';
import { auth } from '@/lib/auth';
import { captureAppError } from '@/lib/monitoring/capture-app-error';
import { formatPlural, getDictionary, isLocale, type Locale } from '@/shared/i18n';
import { UserAvatar } from '@/shared/ui';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RoomPageProps = {
    params: Promise<{ locale: string; code: string }>;
};

/**
 * Превью ссылки-приглашения: жирная строка Telegram — «{name} зовёт в
 * комнату {code}», ниже — сколько уже внутри и настройки. Картинка —
 * opengraph-image рядом. Комнаты нет — только заголовок вкладки.
 */
export async function generateMetadata({ params }: RoomPageProps): Promise<Metadata> {
    const { locale: rawLocale, code: rawCode } = await params;
    const locale = isLocale(rawLocale) ? rawLocale : 'ru';
    const dictionary = getDictionary(locale);
    const text = dictionary.room;
    const code = normalizeRoomCode(rawCode);
    const pageTitle = fillRoomText(text.pageTitle, { code: code ?? '' });
    const state = code ? await readRoomState({ code, userId: null, locale }).catch(() => null) : null;
    const host = state?.players.find((player) => player.isHost);

    if (!state || !host) {
        return { title: pageTitle, robots: { index: false } };
    }

    const title = fillRoomText(text.ogInviteTitle, { name: host.nickname, code: state.code });
    const description = fillRoomText(text.ogInviteDesc, {
        players: formatPlural(locale, state.players.length, text.playersCount),
        settings: roomSettingsLine(dictionary, locale, state.settings),
    });

    return {
        title,
        description,
        robots: { index: false },
        openGraph: { title, description, siteName: 'GameMind', type: 'website' },
    };
}

async function loadState(code: string, userId: string | null, locale: Locale) {
    try {
        return await readRoomState({ code, userId, locale });
    } catch (error) {
        captureAppError(error, { area: 'quiz-room', level: 'warning', extra: { operation: 'page' } });
        return 'error' as const;
    }
}

function RoomInvite({ locale, state }: { locale: Locale; state: RoomStateDto }) {
    const dictionary = getDictionary(locale);
    const host = state.players.find((player) => player.isHost);

    return (
        <section className="rounded-lg border border-border bg-surface p-5 text-center shadow-sm">
            <p className="font-mono text-2xs font-medium uppercase tracking-[0.14em] text-muted">
                {dictionary.room.title}
            </p>
            <p className="mt-1 font-display text-6xl font-bold tracking-[0.18em] text-foreground">
                {state.code}
            </p>
            {host ? (
                <div className="mt-4 flex items-center justify-center gap-3 text-left">
                    <UserAvatar src={host.avatarUrl} pattern={host.avatarPattern} size="base" />
                    <div className="min-w-0">
                        <p className="font-semibold text-foreground">
                            {fillRoomText(dictionary.room.invite, { name: host.nickname })}
                        </p>
                        <p className="font-mono text-xs text-muted">
                            {fillRoomText(dictionary.room.inviteFacts, {
                                players: formatPlural(locale, state.players.length, dictionary.room.playersCount),
                                questions: roomQuestionsLabel(dictionary, locale, state.settings.questionCount),
                                difficulty: roomDifficultyLabel(dictionary, state.settings.difficulty),
                            })}
                        </p>
                    </div>
                </div>
            ) : null}
        </section>
    );
}

export default async function RoomPage({ params }: RoomPageProps) {
    const { locale: rawLocale, code: rawCode } = await params;
    const locale = isLocale(rawLocale) ? rawLocale : 'ru';
    const dictionary = getDictionary(locale);
    const code = normalizeRoomCode(rawCode);

    if (code && code !== rawCode) {
        redirect(`/${locale}/room/${code}`);
    }

    const session = await auth();
    const userId = session?.user?.id ?? null;
    const canCreate = Boolean(userId) && session?.user?.isGuest !== true;
    const state = code ? await loadState(code, userId, locale) : null;

    if (!code || !state || state === 'error') {
        return (
            <main className="mx-auto max-w-md px-4 py-6 sm:py-10">
                <div className="rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-6">
                    <RoomEntry
                        locale={locale}
                        canCreate={canCreate}
                        codeError={
                            state === 'error'
                                ? dictionary.room.errors.generic
                                : dictionary.room.errors.notFound
                        }
                        initialCode={rawCode}
                    />
                </div>
            </main>
        );
    }

    if (state.me) {
        return (
            <main className="mx-auto max-w-xl px-4 py-4 sm:py-8">
                <RoomClient locale={locale} initialState={state} />
            </main>
        );
    }

    const blocked =
        state.status === 'lobby'
            ? null
            : roomErrorMessage(dictionary, state.status === 'closed' ? 'CLOSED' : 'STARTED');

    return (
        <main className="mx-auto flex max-w-md flex-col gap-3 px-4 py-6 sm:py-10">
            <RoomInvite locale={locale} state={state} />
            <section className="rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-5">
                {blocked ? (
                    <p className="text-sm text-foreground">{blocked}</p>
                ) : !userId ? (
                    <RoomGuestGate locale={locale} code={code} />
                ) : (
                    <RoomJoinForm
                        locale={locale}
                        code={code}
                        defaultNickname={
                            session?.user?.isGuest
                                ? generateRoomNickname(dictionary.room.nicknameWords)
                                : nicknameFromUsername(session?.user?.username ?? 'Player')
                        }
                    />
                )}
            </section>
        </main>
    );
}
