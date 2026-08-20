/**
 * Server CTA Survival Mode: optional auth → панель старта.
 *
 * Живёт на mode lobby `/quiz` (не на Home — anti-duplication IA).
 * Presentation only. Snapshot / SurvivalRun пишет `startSurvivalQuizAction`.
 * Canon: docs/DECISIONS.md → Survival Mode MVP.
 */

import { SurvivalModeCtaPanel } from '@/features/survival-mode/components/SurvivalModeCtaPanel';
import { auth } from '@/lib/auth';
import type { Dictionary, Locale } from '@/shared/i18n';
import type { ButtonVariant } from '@/shared/ui';

type SurvivalModeCtaProps = {
    locale: Locale;
    dictionary: Dictionary;
    className?: string;
    startVariant?: ButtonVariant;
};

export async function SurvivalModeCta({
    locale,
    dictionary,
    className = '',
    startVariant = 'secondary',
}: SurvivalModeCtaProps) {
    const session = await auth();

    return (
        <div className={className}>
            <SurvivalModeCtaPanel
                locale={locale}
                dictionary={dictionary}
                isAuthenticated={Boolean(session?.user?.id)}
                startVariant={startVariant}
            />
        </div>
    );
}
