import { notFound } from 'next/navigation';

import { quizSessionRepository } from '@/entities/quiz-session/quiz-session.repository';
import { QuizSessionForm } from '@/features/quiz/components/QuizSessionForm';
import { requireUser } from '@/lib/auth/guards';
import { getDictionary, isLocale } from '@/shared/i18n';

// пропсы страницы сессии викторины
type QuizSessionPageProps = {
    params: Promise<{ locale: string; sessionId: string }>;
};

// страница сессии викторины
export default async function QuizSessionPage({
    params,
}: QuizSessionPageProps) {
    // получаем параметры из URL
    const { locale, sessionId } = await params;
    // проверяем локаль
    const safeLocale = isLocale(locale) ? locale : 'ru';
    // получаем словарь
    const dictionary = getDictionary(safeLocale);
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
        <main className="mx-auto max-w-2xl p-8">
            <h1 className="text-2xl font-semibold">
                {dictionary.quiz.sessionTitle}
            </h1>

            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
                {dictionary.quiz.session}: {sessionId}
            </p>

            <QuizSessionForm
                locale={safeLocale}
                sessionId={sessionId}
                questions={questions}
                dictionary={dictionary}
            />
        </main>
    );
}
