/**
 * Server CTA Timed Mode: optional auth → панель старта.
 *
 * Presentation only. Дедлайн / snapshot пишет `startTimedQuizAction`.
 * Canon: docs/DECISIONS.md → Timed Mode MVP.
 */

import { TimedModeCtaPanel } from '@/features/timed-mode/components/TimedModeCtaPanel';
import { auth } from '@/lib/auth';
import type { Dictionary, Locale } from '@/shared/i18n';

type TimedModeCtaProps = {
    locale: Locale;
    dictionary: Dictionary;
    className?: string;
};

export async function TimedModeCta({
    locale,
    dictionary,
    className = '',
}: TimedModeCtaProps) {
    const session = await auth();

    return (
        <div className={className}>
            <TimedModeCtaPanel
                locale={locale}
                dictionary={dictionary}
                isAuthenticated={Boolean(session?.user?.id)}
            />
        </div>
    );
}
