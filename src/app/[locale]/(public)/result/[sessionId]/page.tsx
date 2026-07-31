import { Suspense } from 'react';
import { notFound } from 'next/navigation';

import { quizResultRepository } from '@/entities/quiz-result/quiz-result.repository';
import { AchievementUnlockFlash } from '@/features/achievements/components/AchievementUnlockFlash';
import { parseUnlockedQuery } from '@/features/achievements/lib/parse-unlocked-query';
import { QuizResultReviewSection } from '@/features/quiz/components/QuizResultReviewSection';
import { QuizResultReviewSkeleton } from '@/features/quiz/components/QuizResultReviewSkeleton';
import { QuizResultSummary } from '@/features/quiz/components/QuizResultSummary';
import { getMaxPossibleScore } from '@/features/quiz/lib/scoring';
import { TimedClockRoastBanner } from '@/features/timed-mode/components/TimedClockRoastBanner';
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
                    />

                    {/*
                      Review в Suspense: locale switch / Neon timeout не держат
                      очки на экране. max score — из JOIN snapshot в result read.
                    */}
                    <Suspense fallback={<QuizResultReviewSkeleton />}>
                        <QuizResultReviewSection
                            sessionId={sessionId}
                            userId={authSession.user.id}
                            locale={safeLocale}
                            dictionary={dictionary}
                        />
                    </Suspense>
                </>
            )}
        </main>
    );
}
