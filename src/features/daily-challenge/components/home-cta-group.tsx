/**
 * CTA-ряд Home: primary/secondary зависят от статуса Daily.
 *
 * in_progress → primary «Продолжить челлендж», secondary «Все режимы».
 * иначе → primary «Выбрать режим», secondary = Daily action-tease.
 * Presentation only; start через тот же Server Action.
 */

import { HomeCtaGroupPanel } from '@/features/daily-challenge/components/home-cta-group-panel';
import { getDailyChallengePlayerStatus } from '@/features/daily-challenge/lib/get-daily-challenge-player-status';
import { auth } from '@/lib/auth';
import type { Dictionary, Locale } from '@/shared/i18n';

type HomeCtaGroupProps = {
    locale: Locale;
    dictionary: Dictionary;
};

export async function HomeCtaGroup({ locale, dictionary }: HomeCtaGroupProps) {
    const session = await auth();
    const status = await getDailyChallengePlayerStatus(
        session?.user?.id ?? null,
    );

    return (
        <HomeCtaGroupPanel
            locale={locale}
            status={status}
            dictionary={dictionary}
        />
    );
}
