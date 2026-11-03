/**
 * Первый экран посетителя без сессии (4.3c): одна фраза «что это», живой
 * демо-вопрос и вход гостем. Вернувшийся игрок этого не видит — главная
 * сразу про игру (ADR «Home is the play hub»).
 *
 * Server Component: заголовок, описание и вопрос дня приходят в HTML —
 * их индексируют поисковики (Яндекс в первую очередь). Клиентский только
 * сам вопрос (нажатия) и форма гостевого входа.
 */

import { GuestSignInForm } from '@/features/auth/components/GuestPlayPrompt';
import { getMoscowDateKey } from '@/features/daily-challenge/lib/get-moscow-date-key';
import { DemoQuestionCard } from '@/features/visitor-intro/components/DemoQuestionCard';
import {
    DEMO_QUESTIONS,
    pickDemoStartIndex,
    toDemoQuestionView,
} from '@/features/visitor-intro/lib/demo-questions';
import type { Dictionary, Locale } from '@/shared/i18n';
import { PendingLink } from '@/shared/ui';

type VisitorIntroProps = {
    locale: Locale;
    dictionary: Dictionary;
};

export function VisitorIntro({ locale, dictionary }: VisitorIntroProps) {
    const questions = DEMO_QUESTIONS.map((question) =>
        toDemoQuestionView(question, locale),
    );
    const startIndex = pickDemoStartIndex(
        getMoscowDateKey(),
        questions.length,
    );

    return (
        <div className="mb-6 sm:mb-8">
            <header>
                <h1 className="text-balance font-display text-2xl font-semibold tracking-tight text-foreground sm:text-4xl">
                    {dictionary.home.headline}
                </h1>
                <p className="mt-2 max-w-prose text-pretty text-sm leading-snug text-muted sm:text-base sm:leading-relaxed">
                    {dictionary.home.description}
                </p>
            </header>

            <div className="mt-4">
                <DemoQuestionCard
                    questions={questions}
                    startIndex={startIndex}
                    dictionary={dictionary}
                />
            </div>

            <GuestSignInForm
                locale={locale}
                dictionary={dictionary}
                className="mt-3"
            />
            <p className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm text-muted">
                <span>{dictionary.auth.guestHint}</span>
                <PendingLink
                    href={`/${locale}/login`}
                    className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                    {dictionary.nav.login}
                </PendingLink>
            </p>
        </div>
    );
}
