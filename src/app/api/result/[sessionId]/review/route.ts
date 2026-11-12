/**
 * Отложенный review после submit.
 *
 * Prefers QuizResult.reviewPayload (slim, option B). Legacy: reviewSnapshot TOAST.
 * Auth + ownership на сервере. Canon: result incident Aug 4.
 */

import { NextResponse } from 'next/server';

import { findAudioCreditsByQuestionIds } from '@/entities/question/question-audio-credit.repository';
import { quizResultRepository } from '@/entities/quiz-result/quiz-result.repository';
import { triviaFactRepository } from '@/entities/trivia-fact/trivia-fact.repository';
import { buildSessionReviewPayloadFromSnapshot } from '@/features/quiz/lib/build-session-review-payload';
import { mapCompactReviewPayloadToItems } from '@/features/quiz/lib/map-compact-review-payload';
import { mapQuizResultReview } from '@/features/quiz/lib/map-quiz-result-review';
import { pickTriviaFactsForSession } from '@/features/quiz/lib/pick-trivia-fact';
import type { QuizResultReviewItem } from '@/features/quiz/types';
import { DirectPgTimeoutError } from '@/lib/db/direct-pg';
import { auth } from '@/lib/auth';
import { captureAppError } from '@/lib/monitoring/capture-app-error';
import { isLocale, type Locale } from '@/shared/i18n';

/**
 * Подпись трека к аудиовопросам (ADR AUDIO_GUESS, Rights). Отдельный
 * короткий pooled SELECT только если в партии есть клипы; сбой — разбор
 * без подписи, а не 500.
 */
async function withAudioCredits(
    items: QuizResultReviewItem[],
): Promise<QuizResultReviewItem[]> {
    const audioIds = items
        .filter((item) => item.type === 'AUDIO_GUESS')
        .map((item) => item.questionId);
    if (audioIds.length === 0) {
        return items;
    }
    try {
        const credits = await findAudioCreditsByQuestionIds(audioIds);
        return items.map((item) =>
            item.type === 'AUDIO_GUESS'
                ? { ...item, audioCredit: credits.get(item.questionId) ?? null }
                : item,
        );
    } catch (error) {
        console.error('Quiz result audio credits failed:', error);
        return items;
    }
}

/**
 * Факты «А ты знал?» к вопросам разбора (ADR «Did you know: trivia facts»).
 * Тот же выбор, что у плашки после ответа: в порядке вопросов, без повторов.
 * Один короткий pooled SELECT; сбой — разбор без фактов, а не 500.
 */
async function withTriviaFacts(
    sessionId: string,
    items: QuizResultReviewItem[],
    locale: Locale,
): Promise<QuizResultReviewItem[]> {
    if (items.length === 0) {
        return items;
    }
    try {
        const candidates =
            await triviaFactRepository.findCandidatesByQuestionIds(
                items.map((item) => item.questionId),
            );
        const picked = pickTriviaFactsForSession(sessionId, items, candidates);
        return items.map((item) => {
            const fact = picked.get(item.questionId);
            return fact
                ? {
                      ...item,
                      fact: {
                          text: locale === 'en' ? fact.textEn : fact.textRu,
                      },
                  }
                : item;
        });
    } catch (error) {
        console.error('Quiz result trivia facts failed:', error);
        return items;
    }
}

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

    try {
        const review = await quizResultRepository.findReviewBySessionIdForUser(
            sessionId,
            userId,
        );

        if (!review) {
            return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
        }

        if (review.kind === 'pending') {
            return NextResponse.json({ error: 'PENDING' }, { status: 503 });
        }

        let items: QuizResultReviewItem[] = [];

        if (review.kind === 'payload') {
            items = mapCompactReviewPayloadToItems(review.payload, {
                locale,
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
            );
        }

        // Подписи треков и факты — независимые best-effort запросы: параллельно.
        const [withCredits, withFacts] = await Promise.all([
            withAudioCredits(items),
            withTriviaFacts(sessionId, items, locale),
        ]);
        return NextResponse.json({
            items: withCredits.map((item, index) => ({
                ...item,
                fact: withFacts[index]?.fact ?? null,
            })),
        });
    } catch (error) {
        if (error instanceof DirectPgTimeoutError) {
            console.error('Quiz result review API timed out:', error.message);
            return NextResponse.json({ error: 'TIMEOUT' }, { status: 503 });
        }

        console.error('Quiz result review API failed:', error);
        // Таймаут Neon выше — ожидаемый (клиент повторит); сюда — непонятный сбой.
        captureAppError(error, {
            area: 'quiz-result',
            level: 'warning',
            extra: { stage: 'review-api', sessionId },
        });
        return NextResponse.json({ error: 'FAILED' }, { status: 500 });
    }
}
