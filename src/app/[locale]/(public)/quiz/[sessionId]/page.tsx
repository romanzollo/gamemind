import { notFound } from 'next/navigation';

import { questionRepository } from '@/entities/question/question.repository';
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

    // поиск незавершенной сессии по ID и ID пользователя
    const quizSession = await quizSessionRepository.findInProgressByIdForUser(
        sessionId,
        authSession.user.id,
    );

    // если сессия не найдена, возвращаем 404
    if (!quizSession) {
        notFound();
    }

    // поиск активных публичных вопросов по сложности
    const questions = await questionRepository.findActivePublicByDifficulty(
        quizSession.difficulty,
        quizSession.questionCount,
    );

    return (
        <main className="mx-auto max-w-2xl p-8">
            <h1 className="text-2xl font-semibold">
                {dictionary.quiz.sessionTitle}
            </h1>

            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
                {dictionary.quiz.session}: {quizSession.id}
            </p>

            <QuizSessionForm
                locale={safeLocale}
                sessionId={quizSession.id}
                questions={questions}
                dictionary={dictionary}
            />
        </main>
    );
}
