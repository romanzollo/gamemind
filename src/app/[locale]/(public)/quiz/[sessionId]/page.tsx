import { notFound } from 'next/navigation';

import { quizSessionRepository } from '@/entities/quiz-session/quiz-session.repository';
import { QuizSessionForm } from '@/features/quiz/components/QuizSessionForm';
import { requireUser } from '@/lib/auth/guards';
import { getDictionary, isLocale } from '@/shared/i18n';

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

    const questions =
        await quizSessionRepository.findSnapshotPublicQuestionsForUser(
            sessionId,
            authSession.user.id,
        );

    if (!questions) {
        notFound();
    }

    return (
        <main className="mx-auto max-w-2xl px-4 py-6 sm:px-8 sm:py-8">
            <header className="pb-2 sm:pb-4">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                    {dictionary.quiz.sessionTitle}
                </h1>
            </header>

            <QuizSessionForm
                locale={safeLocale}
                sessionId={sessionId}
                questions={questions}
                dictionary={dictionary}
            />
        </main>
    );
}
