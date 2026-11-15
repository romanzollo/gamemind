/**
 * `/room` — вход в комнату без ссылки: создать или ввести код. Форма кода
 * приходит сюда же GET-запросом (`?code=k7qf`): верный код → страница
 * комнаты, неверный — та же форма с подсказкой.
 * Canon: docs/DECISIONS.md → Quiz room.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { RoomEntry } from '@/features/quiz-room/components/RoomEntry';
import { normalizeRoomCode } from '@/features/quiz-room/lib/room-code';
import { auth } from '@/lib/auth';
import { getDictionary, isLocale } from '@/shared/i18n';

export const dynamic = 'force-dynamic';

type RoomEntryPageProps = {
    params: Promise<{ locale: string }>;
    searchParams: Promise<{ code?: string | string[] }>;
};

export async function generateMetadata({ params }: RoomEntryPageProps): Promise<Metadata> {
    const { locale } = await params;
    const dictionary = getDictionary(isLocale(locale) ? locale : 'ru');

    return { title: `${dictionary.room.title} — GameMind`, robots: { index: false } };
}

export default async function RoomEntryPage({ params, searchParams }: RoomEntryPageProps) {
    const { locale: rawLocale } = await params;
    const locale = isLocale(rawLocale) ? rawLocale : 'ru';
    const dictionary = getDictionary(locale);
    const { code: rawCode } = await searchParams;
    const typed = Array.isArray(rawCode) ? rawCode[0] : rawCode;
    const code = normalizeRoomCode(typed);

    if (code) {
        redirect(`/${locale}/room/${code}`);
    }

    const session = await auth();
    const canCreate = Boolean(session?.user?.id) && session?.user?.isGuest !== true;

    return (
        <main className="mx-auto max-w-md px-4 py-6 sm:py-10">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
                {dictionary.room.title}
            </h1>
            <p className="mt-2 text-sm text-muted">{dictionary.room.description}</p>
            <p className="mt-1 text-xs text-muted">{dictionary.room.notRanked}</p>
            <div className="mt-6 rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-6">
                <RoomEntry
                    locale={locale}
                    canCreate={canCreate}
                    initialCode={typed}
                    codeError={typed ? dictionary.room.codeInvalid : undefined}
                />
            </div>
        </main>
    );
}
