import { redirect } from 'next/navigation';

import { isLocale } from '@/shared/i18n';

type QuizLobbyPageProps = {
    params: Promise<{ locale: string }>;
};

/**
 * Бывшее лобби режимов. Всё, что здесь было, живёт на главной
 * (ADR «Home is the play hub»). Обычный GET перенаправляет ещё proxy (307);
 * страница остаётся маршрутом для Server Action из открытой старой вкладки:
 * его POST на `/quiz` proxy пропускает, и без маршрута он получил бы 404
 * (DECISIONS, симптом `POST /quiz` → GET 404).
 */
export default async function QuizLobbyPage({ params }: QuizLobbyPageProps) {
    const { locale } = await params;

    redirect(`/${isLocale(locale) ? locale : 'ru'}`);
}
