/**
 * Отложенный review после submit.
 *
 * Prefers QuizResult.reviewPayload (slim, option B). Legacy: reviewSnapshot TOAST.
 * Auth + ownership на сервере. Canon: result incident Aug 4.
 */

import { NextResponse } from 'next/server';

import { quizResultRepository } from '@/entities/quiz-result/quiz-result.repository';
import { buildSessionReviewPayloadFromSnapshot } from '@/features/quiz/lib/build-session-review-payload';
import { mapCompactReviewPayloadToItems } from '@/features/quiz/lib/map-compact-review-payload';
import { mapQuizResultReview } from '@/features/quiz/lib/map-quiz-result-review';
import type { QuizResultReviewItem } from '@/features/quiz/types';
import { DirectPgTimeoutError } from '@/lib/db/direct-pg';
import { auth } from '@/lib/auth';
import { getDictionary, isLocale } from '@/shared/i18n';

type ReviewRouteContext = {
    params: Promise<{ sessionId: string }>;
};

export async function GET(
    request: Request,
    context: ReviewRouteContext,
): Promise<NextResponse> {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
        return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }

    const { sessionId } = await context.params;
    const localeParam = new URL(request.url).searchParams.get('locale');
    const locale =
        localeParam && isLocale(localeParam) ? localeParam : 'ru';
    const dictionary = getDictionary(locale);

    try {
        const review = await quizResultRepository.findReviewBySessionIdForUser(
            sessionId,
            userId,
        );

        if (!review) {
            return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
        }

        let items: QuizResultReviewItem[] = [];

        if (review.kind === 'payload') {
            items = mapCompactReviewPayloadToItems(review.payload, {
                locale,
                unansweredLabel: dictionary.quiz.unansweredLabel,
            });
        } else {
            items = mapQuizResultReview(
                buildSessionReviewPayloadFromSnapshot({
                    sessionId: review.bundle.sessionId,
                    questionCount: review.bundle.questionCount,
                    snapshotData: review.bundle.snapshotData,
                    answers: review.bundle.answers,
                    locale,
                }),
                {
                    unansweredLabel: dictionary.quiz.unansweredLabel,
                },
            );
        }

        return NextResponse.json({ items });
    } catch (error) {
        if (error instanceof DirectPgTimeoutError) {
            console.error('Quiz result review API timed out:', error.message);
            return NextResponse.json({ error: 'TIMEOUT' }, { status: 503 });
        }

        console.error('Quiz result review API failed:', error);
        return NextResponse.json({ error: 'FAILED' }, { status: 500 });
    }
}
