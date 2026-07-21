import { notFound } from 'next/navigation';

import { quizResultRepository } from '@/entities/quiz-result/quiz-result.repository';
import { quizSessionRepository } from '@/entities/quiz-session/quiz-session.repository';
import { QuizResultReview } from '@/features/quiz/components/QuizResultReview';
import { QuizResultSummary } from '@/features/quiz/components/QuizResultSummary';
import { mapQuizResultReview } from '@/features/quiz/lib/map-quiz-result-review';
import { getMaxPossibleScore } from '@/features/quiz/lib/scoring';
import { requireUser } from '@/lib/auth/guards';
import { getDictionary, isLocale } from '@/shared/i18n';

type QuizResultPageProps = {
    params: Promise<{ locale: string; sessionId: string }>;
};

export default async function QuizResultPage({ params }: QuizResultPageProps) {
    const { locale, sessionId } = await params;
    const safeLocale = isLocale(locale) ? locale : 'ru';
    const dictionary = getDictionary(safeLocale);
    const authSession = await requireUser(safeLocale);

    const result = await quizResultRepository.findBySessionIdForUser(
        sessionId,
        authSession.user.id,
    );

    if (!result) {
        notFound();
    }

    const reviewPayload = await quizSessionRepository.findReviewForUser(
        sessionId,
        authSession.user.id,
        safeLocale,
    );
    const reviewItems = mapQuizResultReview(reviewPayload);

    const maxPossibleScore = reviewPayload
        ? getMaxPossibleScore(
              reviewPayload.questions.map((question) => question.difficulty),
          )
        : null;

    return (
        <main className="mx-auto max-w-2xl px-4 py-5 sm:px-8 sm:py-10">
            <QuizResultSummary
                locale={safeLocale}
                score={result.score}
                maxPossibleScore={maxPossibleScore}
                correctCount={result.correctCount}
                totalQuestions={result.totalQuestions}
                labels={dictionary.quiz}
            />

            <QuizResultReview items={reviewItems} labels={dictionary.quiz} />
        </main>
    );
}
