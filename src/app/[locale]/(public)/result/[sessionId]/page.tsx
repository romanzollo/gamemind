import { notFound } from 'next/navigation';

import { quizResultRepository } from '@/entities/quiz-result/quiz-result.repository';
import { AchievementUnlockFlash } from '@/features/achievements/components/AchievementUnlockFlash';
import { parseUnlockedQuery } from '@/features/achievements/lib/parse-unlocked-query';
import { QuizResultReview } from '@/features/quiz/components/QuizResultReview';
import { QuizResultSummary } from '@/features/quiz/components/QuizResultSummary';
import { buildSessionReviewPayloadFromSnapshot } from '@/features/quiz/lib/build-session-review-payload';
import { mapQuizResultReview } from '@/features/quiz/lib/map-quiz-result-review';
import { getMaxPossibleScore } from '@/features/quiz/lib/scoring';
import { TimedClockRoastBanner } from '@/features/timed-mode/components/TimedClockRoastBanner';
import { TimedRematchButton } from '@/features/timed-mode/components/TimedRematchButton';
import { requireUser } from '@/lib/auth/guards';
import { getDictionary, isLocale } from '@/shared/i18n';
import { InlineAlert, PendingLink, buttonClassName } from '@/shared/ui';

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
    const finishedByClock =
        (Array.isArray(rawSearchParams.clock)
            ? rawSearchParams.clock[0]
            : rawSearchParams.clock) === '1';
    const resultPath = `/${safeLocale}/result/${sessionId}`;
    // Flash снимает только unlocked; clock оставляем (roast на result).
    const resultPathAfterFlash = finishedByClock
        ? `${resultPath}?clock=1`
        : resultPath;

    // Soft-fail Neon: после submit+award TLS иногда клинит; не роняем весь RSC.
    // Score + review answers читаем одним Direct-клиентом (см. repository).
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

    const maxPossibleScore =
        result && result.difficulties.length > 0
            ? getMaxPossibleScore(result.difficulties)
            : null;

    const reviewItems =
        result?.review != null
            ? mapQuizResultReview(
                  buildSessionReviewPayloadFromSnapshot({
                      sessionId: result.review.sessionId,
                      questionCount: result.review.questionCount,
                      snapshotData: result.review.snapshotData,
                      answers: result.review.answers,
                      locale: safeLocale,
                  }),
                  {
                      unansweredLabel: dictionary.quiz.unansweredLabel,
                  },
              )
            : [];

    // Timed: сразу новая партия с той же сложностью (прод-паттерн rematch).
    // Classic/daily: ссылка на setup /quiz.
    const playAgainAction =
        result?.isTimed ? (
            <TimedRematchButton
                locale={safeLocale}
                difficulty={result.difficulty}
                label={dictionary.quiz.timedTryAgain}
                dictionary={dictionary}
            />
        ) : (
            <PendingLink
                href={`/${safeLocale}/quiz`}
                className={buttonClassName({ className: 'w-full sm:w-auto' })}
            >
                {dictionary.quiz.playAgain}
            </PendingLink>
        );

    return (
        <main className="mx-auto max-w-2xl px-4 py-5 sm:px-8 sm:py-10">
            <AchievementUnlockFlash
                codes={unlockedCodes}
                resultPath={resultPathAfterFlash}
            />

            {resultLoadFailed || !result ? (
                <InlineAlert tone="warning" role="status">
                    {dictionary.quiz.errors.resultLoadFailed}
                </InlineAlert>
            ) : (
                <>
                    {finishedByClock ? (
                        <TimedClockRoastBanner
                            eyebrow={dictionary.quiz.timedClockRoastEyebrow}
                            title={dictionary.quiz.timedClockRoastTitle}
                            body={dictionary.quiz.timedClockRoast}
                        />
                    ) : null}

                    <QuizResultSummary
                        locale={safeLocale}
                        score={result.score}
                        maxPossibleScore={maxPossibleScore}
                        correctCount={result.correctCount}
                        totalQuestions={result.totalQuestions}
                        labels={dictionary.quiz}
                        playAgainAction={playAgainAction}
                    />

                    {reviewItems.length > 0 ? (
                        <QuizResultReview
                            items={reviewItems}
                            labels={dictionary.quiz}
                        />
                    ) : (
                        <InlineAlert className="mt-4" tone="warning" role="status">
                            {dictionary.quiz.errors.resultLoadFailed}
                        </InlineAlert>
                    )}
                </>
            )}
        </main>
    );
}
