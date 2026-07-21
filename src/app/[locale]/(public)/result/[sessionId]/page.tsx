import Link from 'next/link';
import { notFound } from 'next/navigation';

import { quizResultRepository } from '@/entities/quiz-result/quiz-result.repository';
import { quizSessionRepository } from '@/entities/quiz-session/quiz-session.repository';
import { QuizResultReview } from '@/features/quiz/components/QuizResultReview';
import { mapQuizResultReview } from '@/features/quiz/lib/map-quiz-result-review';
import { getMaxPossibleScore } from '@/features/quiz/lib/scoring';
import { requireUser } from '@/lib/auth/guards';
import { getDictionary, isLocale } from '@/shared/i18n';
import { buttonClassName } from '@/shared/ui';

type QuizResultPageProps = {
    params: Promise<{ locale: string; sessionId: string }>;
};

// страница результатов квиза
export default async function QuizResultPage({ params }: QuizResultPageProps) {
    const { locale, sessionId } = await params;
    const safeLocale = isLocale(locale) ? locale : 'ru';
    const dictionary = getDictionary(safeLocale);
    const authSession = await requireUser(safeLocale);

    // результаты сессии
    const result = await quizResultRepository.findBySessionIdForUser(
        sessionId,
        authSession.user.id,
    );

    if (!result) {
        notFound();
    }

    // результаты обзора сессии
    const reviewPayload = await quizSessionRepository.findReviewForUser(
        sessionId,
        authSession.user.id,
        safeLocale,
    );
    // преобразование результатов обзора сессии в тип QuizResultReviewItem
    const reviewItems = mapQuizResultReview(reviewPayload);

    const maxPossibleScore = reviewPayload
        ? getMaxPossibleScore(
              reviewPayload.questions.map((question) => question.difficulty),
          )
        : null;

    return (
        <main className="mx-auto max-w-2xl p-8">
            <h1 className="text-2xl font-semibold text-foreground">
                {dictionary.quiz.resultTitle}
            </h1>

            <div className="mt-4 space-y-2 text-muted">
                <p>
                    {dictionary.quiz.scoreLabel}:{' '}
                    {maxPossibleScore != null && maxPossibleScore > 0
                        ? `${result.score} / ${maxPossibleScore}`
                        : result.score}
                </p>
                <p>
                    {dictionary.quiz.correctAnswersLabel}:{' '}
                    {result.correctCount} / {result.totalQuestions}
                </p>
            </div>

            <nav
                className="mt-6 flex flex-wrap gap-3 text-sm"
                aria-label={dictionary.quiz.resultTitle}
            >
                <Link
                    href={`/${safeLocale}/quiz`}
                    className={buttonClassName()}
                >
                    {dictionary.quiz.playAgain}
                </Link>
                <Link
                    href={`/${safeLocale}/leaderboard`}
                    className={buttonClassName({ variant: 'secondary' })}
                >
                    {dictionary.quiz.toLeaderboard}
                </Link>
                <Link
                    href={`/${safeLocale}`}
                    className={buttonClassName({ variant: 'ghost' })}
                >
                    {dictionary.quiz.backHome}
                </Link>
            </nav>

            <QuizResultReview items={reviewItems} labels={dictionary.quiz} />
        </main>
    );
}
