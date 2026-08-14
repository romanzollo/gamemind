import { Suspense } from 'react';
import { connection } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';

import { quizResultRepository } from '@/entities/quiz-result/quiz-result.repository';
import { parseUnlockedQuery } from '@/features/achievements/lib/parse-unlocked-query';
import { QuizResultSummary } from '@/features/quiz/components/QuizResultSummary';
import { ResultSecondaryPanel } from '@/features/quiz/components/ResultSecondaryPanel';
import { ClassicRematchButton } from '@/features/quiz/components/ClassicRematchButton';
import { getMaxPossibleScore } from '@/features/quiz/lib/scoring';
import { getMixedMaxPossibleScore } from '@/features/quiz/lib/mixed-difficulty-split';
import { TimedClockRoastBanner } from '@/features/timed-mode/components/TimedClockRoastBanner';
import { TimedRematchButton } from '@/features/timed-mode/components/TimedRematchButton';
import { requireUser } from '@/lib/auth/guards';
import { getDictionary, isLocale } from '@/shared/i18n';
import { InlineAlert } from '@/shared/ui';

// Result создаётся сразу после submit и принадлежит конкретному пользователю.
// force-dynamic + soft-miss: notFound() кешируется Router Cache (как quiz session).
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type QuizResultPageProps = {
    params: Promise<{ locale: string; sessionId: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Post-submit / prefetch race: краткий retry перед soft-fail. */
const SUMMARY_LOAD_RETRY_MS = 400;

export default async function QuizResultPage({
    params,
    searchParams,
}: QuizResultPageProps) {
    noStore();
    await connection();

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
    const resultPathAfterFlash = finishedByClock
        ? `${resultPath}?clock=1`
        : resultPath;

    // Critical path: скаляры. Suspense: award + клиентский review (не JSONB в RSC).
    let summary: Awaited<
        ReturnType<typeof quizResultRepository.findSummaryBySessionIdForUser>
    > = null;
    let summaryLoadFailed = false;

    try {
        summary = await quizResultRepository.findSummaryBySessionIdForUser(
            sessionId,
            authSession.user.id,
        );

        if (!summary) {
            await new Promise((resolve) =>
                setTimeout(resolve, SUMMARY_LOAD_RETRY_MS),
            );
            summary = await quizResultRepository.findSummaryBySessionIdForUser(
                sessionId,
                authSession.user.id,
            );
        }
    } catch (error) {
        console.error('Quiz result summary load failed:', error);
        summaryLoadFailed = true;
    }

    // Не notFound(): prefetch/race miss кешируется как 404 навсегда для URL.
    if (!summary && !summaryLoadFailed) {
        if (process.env.NODE_ENV === 'development') {
            console.warn(
                `Quiz result page soft-miss session=${sessionId.slice(0, 8)} ` +
                    `user=${authSession.user.id.slice(0, 8)} (after retry)`,
            );
        }

        return (
            <main className="mx-auto max-w-2xl px-4 py-5 sm:px-8 sm:py-10">
                <InlineAlert tone="warning" role="status">
                    {dictionary.quiz.errors.resultLoadFailed}
                </InlineAlert>
                <p className="mt-4 flex flex-wrap gap-4">
                    <Link
                        href={`/${safeLocale}/quiz`}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                        {dictionary.nav.quiz}
                    </Link>
                    <Link
                        href={`/${safeLocale}/profile`}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                        {dictionary.nav.profile}
                    </Link>
                </p>
            </main>
        );
    }

    const maxPossibleScore = summary
        ? summary.poolKind === 'MIXED'
            ? getMixedMaxPossibleScore(summary.totalQuestions)
            : summary.difficulties.length > 0
              ? getMaxPossibleScore(summary.difficulties)
              : null
        : null;

    const playAgainAction = summary?.isTimed ? (
        <TimedRematchButton
            locale={safeLocale}
            difficulty={summary.setupDifficulty}
            label={dictionary.quiz.timedTryAgain}
            dictionary={dictionary}
        />
    ) : summary ? (
        <ClassicRematchButton
            locale={safeLocale}
            difficulty={summary.setupDifficulty}
            questionCount={summary.totalQuestions}
            label={dictionary.quiz.playAgain}
            dictionary={dictionary}
        />
    ) : null;

    return (
        <main className="mx-auto max-w-2xl px-4 py-5 sm:px-8 sm:py-10">
            {summaryLoadFailed || !summary ? (
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
                        score={summary.score}
                        maxPossibleScore={maxPossibleScore}
                        correctCount={summary.correctCount}
                        totalQuestions={summary.totalQuestions}
                        setupDifficulty={summary.setupDifficulty}
                        labels={dictionary.quiz}
                        playAgainAction={playAgainAction}
                    />

                    <Suspense
                        fallback={
                            <p
                                className="mt-4 text-sm text-muted"
                                role="status"
                            >
                                {dictionary.common.loading}
                            </p>
                        }
                    >
                        <ResultSecondaryPanel
                            sessionId={sessionId}
                            userId={authSession.user.id}
                            locale={safeLocale}
                            dictionary={dictionary}
                            resultPath={resultPathAfterFlash}
                            urlUnlockedCodes={unlockedCodes}
                        />
                    </Suspense>
                </>
            )}
        </main>
    );
}
