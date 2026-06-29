import { notFound } from 'next/navigation';

import { quizResultRepository } from '@/entities/quiz-result/quiz-result.repository';
import { requireUser } from '@/lib/auth/guards';
import { getDictionary, isLocale } from '@/shared/i18n';

// пропсы страницы результата викторины
type QuizResultPageProps = {
    params: Promise<{ locale: string; sessionId: string }>;
};

// страница результата викторины
export default async function QuizResultPage({ params }: QuizResultPageProps) {
    // получаем параметры из URL
    const { locale, sessionId } = await params;
    // проверяем локаль
    const safeLocale = isLocale(locale) ? locale : 'ru';
    // получаем словарь для текущей локали
    const dictionary = getDictionary(safeLocale);
    // получаем сессию пользователя для защиты маршрута
    const authSession = await requireUser(safeLocale);
    // получаем результат викторины по ID сессии и ID пользователя
    const result = await quizResultRepository.findBySessionIdForUser(
        sessionId,
        authSession.user.id,
    );
    // если результат не найден, возвращаем 404
    if (!result) {
        notFound();
    }
    // возвращаем страницу результата викторины
    return (
        <main className="mx-auto max-w-2xl p-8">
            <h1 className="text-2xl font-semibold">
                {dictionary.quiz.resultTitle}
            </h1>
            <div className="mt-4 space-y-2 text-neutral-600 dark:text-neutral-400">
                <p>
                    {dictionary.quiz.scoreLabel}: {result.score} /{' '}
                    {result.totalQuestions}
                </p>
                <p>
                    {dictionary.quiz.correctAnswersLabel}: {result.correctCount}
                </p>
            </div>
        </main>
    );
}
