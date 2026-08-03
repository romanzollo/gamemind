import { notFound } from 'next/navigation';

import { quizSessionRepository } from '@/entities/quiz-session/quiz-session.repository';
import { QuizSessionForm } from '@/features/quiz/components/QuizSessionForm';
import { requireUser } from '@/lib/auth/guards';
import { getDictionary, isLocale } from '@/shared/i18n';

// Страница сессии пользовательская и создаётся за секунды до redirect.
// Не даём App Router переиспользовать прежний notFound/RSC payload для нового id.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type QuizSessionPageProps = {
    params: Promise<{ locale: string; sessionId: string }>;
};

export default async function QuizSessionPage({
    params,
}: QuizSessionPageProps) {
    const { locale, sessionId } = await params;
    const safeLocale = isLocale(locale) ? locale : 'ru';
    const dictionary = getDictionary(safeLocale);

    const authSession = await requireUser(safeLocale);

    const sessionView =
        await quizSessionRepository.findSnapshotPublicQuestionsForUser(
            sessionId,
            authSession.user.id,
            safeLocale,
        );

    if (!sessionView) {
        notFound();
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
