/**
 * Server CTA Daily Challenge: auth (optional) → статус → клиентская панель.
 *
 * Ставится на home (вторичный блок под brand CTA) и quiz setup (над classic form).
 * Neon ensure только для залогиненных — гости видят login без лишнего SQL.
 */

import { DailyChallengeCtaPanel } from '@/features/daily-challenge/components/daily-challenge-cta-panel';
import { getDailyChallengePlayerStatus } from '@/features/daily-challenge/lib/get-daily-challenge-player-status';
import { auth } from '@/lib/auth';
import type { Dictionary, Locale } from '@/shared/i18n';

type DailyChallengeCtaProps = {
    locale: Locale;
    dictionary: Dictionary;
    className?: string;
};

export async function DailyChallengeCta({
    locale,
    dictionary,
    className = '',
}: DailyChallengeCtaProps) {
    const session = await auth();
    const status = await getDailyChallengePlayerStatus(
        session?.user?.id ?? null,
    );

    return (
        <div className={className}>
            <DailyChallengeCtaPanel
                locale={locale}
                status={status}
                dictionary={dictionary}
            />
        </div>
    );
}
