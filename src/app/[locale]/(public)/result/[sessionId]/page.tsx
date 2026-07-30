import { notFound } from 'next/navigation';

import { quizResultRepository } from '@/entities/quiz-result/quiz-result.repository';
import { quizSessionRepository } from '@/entities/quiz-session/quiz-session.repository';
import { AchievementUnlockFlash } from '@/features/achievements/components/AchievementUnlockFlash';
import { parseUnlockedQuery } from '@/features/achievements/lib/parse-unlocked-query';
import { QuizResultReview } from '@/features/quiz/components/QuizResultReview';
import { QuizResultSummary } from '@/features/quiz/components/QuizResultSummary';
import { mapQuizResultReview } from '@/features/quiz/lib/map-quiz-result-review';
import { getMaxPossibleScore } from '@/features/quiz/lib/scoring';
import { requireUser } from '@/lib/auth/guards';
import { getDictionary, isLocale } from '@/shared/i18n';
import { InlineAlert } from '@/shared/ui';

type QuizResultPageProps = {
    params: Promise<{ locale: string; sessionId: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function QuizResultPage({
    params,
    searchParams,
}: QuizResultPageProps) {
    const { locale, sessionId } = await params;
    const rawSearchParams = await searchParams;
    const safeLocale = isLocale(locale) ? locale : 'ru';
    const dictionary = getDictionary(safeLocale);
    const authSession = await requireUser(safeLocale);

    const unlockedCodes = parseUnlockedQuery(rawSearchParams.unlocked);
    const resultPath = `/${safeLocale}/result/${sessionId}`;

    // Soft-fail Neon: после submit+award TLS иногда клинит; не роняем весь RSC
    // красным overlay — flash toasts всё равно показать, refresh обычно чинит.
    let result: Awaited<
        ReturnType<typeof quizResultRepository.findBySessionIdForUser>
    > = null;
    let resultLoadFailed = false;

    try {
        result = await quizResultRepository.findBySessionIdForUser(
            sessionId,
            authSession.user.id,
        );
    } catch (error) {
        console.error('Quiz result load failed:', error);
        resultLoadFailed = true;
    }

    if (!result && !resultLoadFailed) {
        notFound();
    }

    let reviewItems: ReturnType<typeof mapQuizResultReview> = [];
    let maxPossibleScore: number | null = null;
    let reviewLoadFailed = false;

    if (result) {
        try {
            const reviewPayload =
                await quizSessionRepository.findReviewForUser(
                    sessionId,
                    authSession.user.id,
                    safeLocale,
                );
            reviewItems = mapQuizResultReview(reviewPayload);
            maxPossibleScore = reviewPayload
                ? getMaxPossibleScore(
                      reviewPayload.questions.map(
                          (question) => question.difficulty,
                      ),
                  )
                : null;
        } catch (error) {
            console.error('Quiz result review load failed:', error);
            reviewLoadFailed = true;
        }
    }

    return (
        <main className="mx-auto max-w-2xl px-4 py-5 sm:px-8 sm:py-10">
            <AchievementUnlockFlash
                codes={unlockedCodes}
                resultPath={resultPath}
            />

            {resultLoadFailed || !result ? (
                <InlineAlert tone="warning" role="status">
                    {dictionary.quiz.errors.resultLoadFailed}
                </InlineAlert>
            ) : (
                <>
                    <QuizResultSummary
                        locale={safeLocale}
                        score={result.score}
                        maxPossibleScore={maxPossibleScore}
                        correctCount={result.correctCount}
                        totalQuestions={result.totalQuestions}
                        labels={dictionary.quiz}
                    />

                    {reviewLoadFailed ? (
                        <InlineAlert
                            className="mt-4"
                            tone="warning"
                            role="status"
                        >
                            {dictionary.quiz.errors.resultLoadFailed}
                        </InlineAlert>
                    ) : (
                        <QuizResultReview
                            items={reviewItems}
                            labels={dictionary.quiz}
                        />
                    )}
                </>
            )}
        </main>
    );
}
