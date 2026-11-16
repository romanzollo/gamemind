'use client';

/**
 * Комната на телефоне участника: состояние с сервера (опрос по расписанию)
 * + фаза по серверным часам → нужный экран: лобби, отсчёт, вопрос, итоги.
 * Экран перерисовывается только при новых данных или смене фазы; секунды
 * тикают внутри самих таймеров (см. use-room-state).
 * До гидратации — каркас: таймеры зависят от часов клиента и разошлись бы
 * с серверной разметкой.
 * Canon: docs/DECISIONS.md → Quiz room.
 */

import Link from 'next/link';

import { RoomFinal } from '@/features/quiz-room/components/RoomFinal';
import { RoomLobby } from '@/features/quiz-room/components/RoomLobby';
import { RoomCountdown, RoomQuestion } from '@/features/quiz-room/components/RoomPlay';
import { useRoomPhase, useRoomState } from '@/features/quiz-room/components/use-room-state';
import type { RoomStateDto } from '@/features/quiz-room/types';
import { getDictionary, type Locale } from '@/shared/i18n';
import { buttonClassName, InlineAlert, Skeleton } from '@/shared/ui';
import { useHydrated } from '@/shared/ui/use-hydrated';

type RoomClientProps = {
    locale: Locale;
    initialState: RoomStateDto;
};

export function RoomClient({ locale, initialState }: RoomClientProps) {
    const hydrated = useHydrated();
    const { state, connectionLost, refresh } = useRoomState(initialState, locale);
    const phase = useRoomPhase(state.schedule);
    const dictionary = getDictionary(locale);

    if (!hydrated) {
        return <Skeleton className="h-96 w-full rounded-lg" />;
    }

    let screen: React.ReactNode;

    if (state.status === 'closed' || !state.me) {
        screen = (
            <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 text-center shadow-sm">
                <p className="text-foreground">
                    {state.me ? dictionary.room.errors.closed : dictionary.room.errors.kicked}
                </p>
                <Link href={`/${locale}`} className={buttonClassName({ className: 'w-full' })}>
                    {dictionary.room.home}
                </Link>
            </div>
        );
    } else if (state.status === 'lobby' || state.status === 'starting') {
        screen = <RoomLobby locale={locale} state={state} refresh={refresh} />;
    } else {
        if (state.status === 'finished' || phase.kind === 'finished') {
            screen = <RoomFinal locale={locale} state={state} />;
        } else if (phase.kind === 'countdown') {
            screen = <RoomCountdown locale={locale} state={state} endsAt={phase.endsAt} />;
        } else {
            screen = (
                <RoomQuestion locale={locale} state={state} phase={phase} refresh={refresh} />
            );
        }
    }

    return (
        <div className="flex flex-col gap-3">
            {connectionLost ? (
                <InlineAlert tone="warning">{dictionary.room.reconnecting}</InlineAlert>
            ) : null}
            {screen}
        </div>
    );
}
