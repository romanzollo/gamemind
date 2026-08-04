import { connection } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';

import { quizSessionRepository } from '@/entities/quiz-session/quiz-session.repository';
import { QuizSessionForm } from '@/features/quiz/components/QuizSessionForm';
import { requireUser } from '@/lib/auth/guards';
import { getDictionary, isLocale } from '@/shared/i18n';
import { InlineAlert } from '@/shared/ui';

// Страница сессии пользовательская и создаётся за секунды до redirect.
// Не даём App Router переиспользовать прежний notFound/RSC payload для нового id.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type QuizSessionPageProps = {
    params: Promise<{ locale: string; sessionId: string }>;
};

/**
 * Post-start race / Router Cache: первый RSC после Server Action redirect
 * иногда вызывает notFound() до того, как следующий GET реально читает БД,
 * и 404 кешируется (~100ms без Direct hop). Retry + soft-fail вместо notFound.
 * Canon: DECISIONS symptom `POST /quiz` → GET 404.
 */
const SESSION_LOAD_RETRY_MS = 400;

export default async function QuizSessionPage({
    params,
}: QuizSessionPageProps) {
    noStore();
    await connection();

    const { locale, sessionId } = await params;
    const safeLocale = isLocale(locale) ? locale : 'ru';
    const dictionary = getDictionary(safeLocale);

    const authSession = await requireUser(safeLocale);

    let sessionView =
        await quizSessionRepository.findSnapshotPublicQuestionsForUser(
            sessionId,
            authSession.user.id,
            safeLocale,
        );

    if (!sessionView) {
        await new Promise((resolve) =>
            setTimeout(resolve, SESSION_LOAD_RETRY_MS),
        );
        sessionView =
            await quizSessionRepository.findSnapshotPublicQuestionsForUser(
                sessionId,
                authSession.user.id,
                safeLocale,
            );
    }

    if (!sessionView) {
        if (process.env.NODE_ENV === 'development') {
            console.warn(
                `Quiz session page soft-miss session=${sessionId.slice(0, 8)} ` +
                    `user=${authSession.user.id.slice(0, 8)} (after retry)`,
            );
        }

        return (
            <main className="mx-auto max-w-2xl px-4 py-5 sm:px-8 sm:py-10">
                <InlineAlert tone="warning" role="status">
                    {dictionary.quiz.errors.sessionLoadFailed}
                </InlineAlert>
                <p className="mt-4">
                    <Link
                        href={`/${safeLocale}/quiz`}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                        {dictionary.nav.quiz}
                    </Link>
                </p>
            </main>
        );
    }

    return (
        <main className="mx-auto max-w-2xl px-4 py-5 sm:px-8 sm:py-10">
            <header className="border-b border-border pb-3 sm:pb-5">
                <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-4xl">
                    {dictionary.quiz.sessionTitle}
                </h1>
            </header>

            <QuizSessionForm
                locale={safeLocale}
                sessionId={sessionId}
                questions={sessionView.questions}
                timedEndsAt={sessionView.timedEndsAt}
                difficulty={sessionView.difficulty}
                dictionary={dictionary}
            />
        </main>
    );
}
