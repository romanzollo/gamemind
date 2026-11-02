/**
 * Server CTA Survival Mode: optional auth → компактная карточка лобби.
 *
 * Живёт на mode lobby `/quiz`. Presentation only.
 * Snapshot / SurvivalRun пишет `startSurvivalQuizAction`.
 * Canon: docs/DECISIONS.md → Survival Mode MVP.
 */

import { SurvivalModeCtaPanel } from '@/features/survival-mode/components/SurvivalModeCtaPanel';
import type { SurvivalDifficulty } from '@/features/survival-mode/types';
import { auth } from '@/lib/auth';
import type { Dictionary, Locale } from '@/shared/i18n';

type SurvivalModeCtaProps = {
    locale: Locale;
    dictionary: Dictionary;
    className?: string;
    /** Последний выбор сложности (cookie лобби). */
    initialDifficulty: SurvivalDifficulty;
};

export async function SurvivalModeCta({
    locale,
    dictionary,
    className = '',
    initialDifficulty,
}: SurvivalModeCtaProps) {
    const session = await auth();

    return (
        <div className={className}>
            <SurvivalModeCtaPanel
                locale={locale}
                dictionary={dictionary}
                isAuthenticated={Boolean(session?.user?.id)}
                initialDifficulty={initialDifficulty}
            />
        </div>
    );
}
