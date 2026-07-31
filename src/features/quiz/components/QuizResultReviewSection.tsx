/**
 * Async RSC: разбор ответов отдельно от summary.
 *
 * Зачем Suspense: смена locale / cold Neon не блокирует очки — score
 * рисуется сразу, review догружается (или мягко падает).
 * Один withDirectPgClient за раз (не Promise.all двух клиентов).
 */

import { quizSessionRepository } from '@/entities/quiz-session/quiz-session.repository';
import { QuizResultReview } from '@/features/quiz/components/QuizResultReview';
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
    try {
        const reviewPayload = await quizSessionRepository.findReviewForUser(
            sessionId,
            userId,
            locale,
        );

        const reviewItems = mapQuizResultReview(reviewPayload, {
            unansweredLabel: dictionary.quiz.unansweredLabel,
        });

        return (
            <QuizResultReview items={reviewItems} labels={dictionary.quiz} />
        );
    } catch (error) {
        console.error('Quiz result review load failed:', error);
        return (
            <InlineAlert className="mt-4" tone="warning" role="status">
                {dictionary.quiz.errors.resultLoadFailed}
            </InlineAlert>
        );
    }
}
