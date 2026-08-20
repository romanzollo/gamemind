/**
 * Server Component: разбор ответов (legacy path).
 * Предпочтительно: ResultSecondaryPanel + client loader + reviewPayload.
 */

import { quizResultRepository } from '@/entities/quiz-result/quiz-result.repository';
import { QuizResultReview } from '@/features/quiz/components/QuizResultReview';
import { buildSessionReviewPayloadFromSnapshot } from '@/features/quiz/lib/build-session-review-payload';
import { mapCompactReviewPayloadToItems } from '@/features/quiz/lib/map-compact-review-payload';
import { mapQuizResultReview } from '@/features/quiz/lib/map-quiz-result-review';
import type { Dictionary, Locale } from '@/shared/i18n';
import { InlineAlert } from '@/shared/ui';

type QuizResultReviewSectionProps = {
    sessionId: string;
    userId: string;
    locale: Locale;
    dictionary: Dictionary;
};

export async function QuizResultReviewSection({
    sessionId,
    userId,
    locale,
    dictionary,
}: QuizResultReviewSectionProps) {
    let review: Awaited<
        ReturnType<typeof quizResultRepository.findReviewBySessionIdForUser>
    > = null;

    try {
        review = await quizResultRepository.findReviewBySessionIdForUser(
            sessionId,
            userId,
        );
    } catch (error) {
        console.error('Quiz result review load failed:', error);
        return (
            <InlineAlert className="mt-4" tone="warning" role="status">
                {dictionary.quiz.errors.reviewLoadFailed}
            </InlineAlert>
        );
    }

    if (!review || review.kind === 'pending') {
        return (
            <InlineAlert className="mt-4" tone="warning" role="status">
                {dictionary.quiz.errors.reviewLoadFailed}
            </InlineAlert>
        );
    }

    const reviewItems =
        review.kind === 'payload'
            ? mapCompactReviewPayloadToItems(review.payload, {
                  locale,
              })
            : mapQuizResultReview(
                  buildSessionReviewPayloadFromSnapshot({
                      sessionId: review.bundle.sessionId,
                      questionCount: review.bundle.questionCount,
                      snapshotData: review.bundle.snapshotData,
                      answers: review.bundle.answers,
                      locale,
                  }),
              );

    // Пустой список валиден (все вопросы без ответа) — не путать с ошибкой загрузки.
    return <QuizResultReview items={reviewItems} labels={dictionary.quiz} />;
}
