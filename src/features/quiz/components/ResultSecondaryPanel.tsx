/**
 * Post-summary панель result: award на сервере + review на клиенте.
 *
 * Review JSONB сразу после submit часто клинит Direct (~8–18s) и раньше
 * блокировал home/Daily CTA через общую очередь. Score остаётся RSC;
 * разбор — QuizResultReviewClientLoader (settle + backoff). Canon: Aug 4.
 */

import { AchievementUnlockFlash } from '@/features/achievements/components/AchievementUnlockFlash';
import { processAchievementOutboxForUser } from '@/features/achievements/lib/award-achievements-for-user';
import type { AchievementCode } from '@/features/achievements/types';
import { QuizResultReviewClientLoader } from '@/features/quiz/components/QuizResultReviewClientLoader';
import type { Dictionary, Locale } from '@/shared/i18n';

type ResultSecondaryPanelProps = {
    sessionId: string;
    userId: string;
    locale: Locale;
    dictionary: Dictionary;
    resultPath: string;
    urlUnlockedCodes: AchievementCode[];
};

export async function ResultSecondaryPanel({
    sessionId,
    userId,
    locale,
    dictionary,
    resultPath,
    urlUnlockedCodes,
}: ResultSecondaryPanelProps) {
    let awardedCodes: AchievementCode[] = [];

    try {
        const award = await processAchievementOutboxForUser(userId);
        awardedCodes = award.awardedCodes;
    } catch (error) {
        console.error(
            'Result achievement outbox flash failed (non-fatal):',
            error,
        );
    }

    const flashCodes =
        awardedCodes.length > 0 ? awardedCodes : urlUnlockedCodes;

    return (
        <>
            {flashCodes.length > 0 ? (
                <AchievementUnlockFlash
                    codes={flashCodes}
                    resultPath={resultPath}
                />
            ) : null}

            <QuizResultReviewClientLoader
                sessionId={sessionId}
                locale={locale}
                labels={dictionary.quiz}
                loadingLabel={dictionary.common.loading}
                retryLabel={dictionary.admin.retryLoad}
            />
        </>
    );
}
