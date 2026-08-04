/**
 * Server Component: после score/review обрабатывает AchievementOutbox
 * и показывает flash. В Suspense — не блокирует первый paint summary.
 *
 * Не Promise.all с result load: общая Direct-очередь сериализует hop'ы.
 * Canon: Achievements MVP + result incident Aug 4.
 */

import { AchievementUnlockFlash } from '@/features/achievements/components/AchievementUnlockFlash';
import { processAchievementOutboxForUser } from '@/features/achievements/lib/award-achievements-for-user';
import type { AchievementCode } from '@/features/achievements/types';

type ResultAchievementOutboxFlashProps = {
    userId: string;
    resultPath: string;
    /** Коды из ?unlocked= (legacy / duplicate-safe). */
    urlUnlockedCodes: AchievementCode[];
};

export async function ResultAchievementOutboxFlash({
    userId,
    resultPath,
    urlUnlockedCodes,
}: ResultAchievementOutboxFlashProps) {
    let awardedCodes: AchievementCode[] = [];

    try {
        const award = await processAchievementOutboxForUser(userId);
        awardedCodes = award.awardedCodes;
    } catch (error) {
        console.error('Result achievement outbox flash failed (non-fatal):', error);
    }

    const codes =
        awardedCodes.length > 0 ? awardedCodes : urlUnlockedCodes;

    if (codes.length === 0) {
        return null;
    }

    return <AchievementUnlockFlash codes={codes} resultPath={resultPath} />;
}
