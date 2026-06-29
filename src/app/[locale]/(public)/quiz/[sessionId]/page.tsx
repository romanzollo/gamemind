import { notFound } from 'next/navigation';

import { questionRepository } from '@/entities/question/question.repository';
import { quizSessionRepository } from '@/entities/quiz-session/quiz-session.repository';
import { requireUser } from '@/lib/auth/guards';
import { getDictionary, isLocale } from '@/shared/i18n';
import { submitQuizAction } from '@/features/quiz/actions';

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

            <form action={submitQuizAction} className="mt-6 space-y-6">
                <input type="hidden" name="locale" value={safeLocale} />
                <input type="hidden" name="sessionId" value={quizSession.id} />

                {questions.map((question, index) => (
                    <section
                        key={question.id}
                        className="rounded border border-(--border) p-4"
                    >
                        <h2 className="font-medium">
                            {index + 1}. {question.text}
                        </h2>

                        <div className="mt-4 space-y-2">
                            {question.options.map((option) => (
                                <label
                                    key={option.id}
                                    className="flex cursor-pointer items-center gap-2 rounded border border-(--border) p-3 transition hover:bg-neutral-100 dark:hover:bg-neutral-800"
                                >
                                    <input
                                        type="radio"
                                        name={question.id} // ключ для formData.get(question.id) в submitQuizAction
                                        value={option.id} // id выбранного варианта
                                        required
                                    />
                                    <span>{option.text}</span>
                                </label>
                            ))}
                        </div>
                    </section>
                ))}

                <button
                    type="submit"
                    className="rounded bg-neutral-900 px-4 py-2 text-white transition hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300 dark:focus-visible:outline-neutral-100"
                >
                    {dictionary.quiz.submitButton}
                </button>
            </form>
        </main>
    );
}
