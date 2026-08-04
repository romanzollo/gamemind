/**
 * Server Component: разбор ответов после summary.
 * Отдельный Direct-hop на reviewSnapshot — не блокирует score UI.
 */

import { quizResultRepository } from '@/entities/quiz-result/quiz-result.repository';
import { QuizResultReview } from '@/features/quiz/components/QuizResultReview';
import { buildSessionReviewPayloadFromSnapshot } from '@/features/quiz/lib/build-session-review-payload';
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
                {dictionary.quiz.errors.resultLoadFailed}
            </InlineAlert>
        );
    }

    if (!review) {
        return (
            <InlineAlert className="mt-4" tone="warning" role="status">
                {dictionary.quiz.errors.resultLoadFailed}
            </InlineAlert>
        );
    }

    const reviewItems = mapQuizResultReview(
        buildSessionReviewPayloadFromSnapshot({
            sessionId: review.sessionId,
            questionCount: review.questionCount,
            snapshotData: review.snapshotData,
            answers: review.answers,
            locale,
        }),
        {
            unansweredLabel: dictionary.quiz.unansweredLabel,
        },
    );

    if (reviewItems.length === 0) {
        return (
            <InlineAlert className="mt-4" tone="warning" role="status">
                {dictionary.quiz.errors.resultLoadFailed}
            </InlineAlert>
        );
    }

    return <QuizResultReview items={reviewItems} labels={dictionary.quiz} />;
}
