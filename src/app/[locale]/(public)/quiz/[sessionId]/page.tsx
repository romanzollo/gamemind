import { notFound } from 'next/navigation';

import { quizSessionRepository } from '@/entities/quiz-session/quiz-session.repository';
import { QuizSessionForm } from '@/features/quiz/components/QuizSessionForm';
import { QuizSetupForm } from '@/features/quiz/components/QuizSetupForm';
import { requireUser } from '@/lib/auth/guards';
import { getDictionary, isLocale } from '@/shared/i18n';

// тип для пропсов страницы сессии викторины
type QuizSessionPageProps = {
    params: Promise<{ locale: string; sessionId: string }>;
};

// страница сессии викторины
export default async function QuizSessionPage({
    params,
}: QuizSessionPageProps) {
    const { locale, sessionId } = await params;
    // проверяем локаль
    const safeLocale = isLocale(locale) ? locale : 'ru';
    // получаем словарь
    const dictionary = getDictionary(safeLocale);

    // В dev Next иногда резолвит /quiz/setup через [sessionId].
    // Держим явный fallback, чтобы setup не превращался в notFound().
    if (sessionId === 'setup') {
        return (
            <main className="mx-auto max-w-2xl p-8">
                <h1 className="text-2xl font-semibold">
                    {dictionary.quiz.setupTitle}
                </h1>

                <p className="mt-2 text-neutral-600 dark:text-neutral-400">
                    {dictionary.quiz.setupDescription}
                </p>

                <QuizSetupForm locale={safeLocale} dictionary={dictionary} />
            </main>
        );
    }

    // получаем сессию пользователя
    const authSession = await requireUser(safeLocale);

    // получаем публичные вопросы из snapshot сессии
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
            <header className="border-b border-border pb-4 sm:pb-6">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                    {dictionary.quiz.sessionTitle}
                </h1>

                <p className="mt-2 text-sm text-muted sm:text-base">
                    {dictionary.quiz.questionCountLabel}: {questions.length}
                </p>
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
