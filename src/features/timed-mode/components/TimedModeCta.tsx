/**
 * Server CTA Timed Mode: optional auth → панель старта.
 *
 * Живёт на mode lobby `/quiz` (не на Home — anti-duplication IA).
 * Presentation only. Дедлайн / snapshot пишет `startTimedQuizAction`.
 * Canon: docs/DECISIONS.md → Timed Mode MVP.
 */

import { TimedModeCtaPanel } from '@/features/timed-mode/components/TimedModeCtaPanel';
import { auth } from '@/lib/auth';
import type { Dictionary, Locale } from '@/shared/i18n';
import type { ButtonVariant } from '@/shared/ui';

type TimedModeCtaProps = {
    locale: Locale;
    dictionary: Dictionary;
    className?: string;
    /** Когда Daily in progress — secondary, чтобы не спорить с «продолжить». */
    startVariant?: ButtonVariant;
};

export async function TimedModeCta({
    locale,
    dictionary,
    className = '',
    startVariant = 'primary',
}: TimedModeCtaProps) {
    const session = await auth();

    return (
        <div className={className}>
            <TimedModeCtaPanel
                locale={locale}
                dictionary={dictionary}
                isAuthenticated={Boolean(session?.user?.id)}
                startVariant={startVariant}
            />
        </div>
    );
}
