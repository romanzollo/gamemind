/**
 * Server CTA Timed Mode: optional auth → панель старта.
 *
 * Presentation only. Дедлайн / snapshot пишет `startTimedQuizAction`.
 * Перед отдачей CTA будим unpooled Neon (best-effort) — иначе первый
 * клик на Windows часто ловит DirectPgTimeout на cold TLS.
 * Canon: docs/DECISIONS.md → Timed Mode MVP.
 */

import { TimedModeCtaPanel } from '@/features/timed-mode/components/TimedModeCtaPanel';
import { auth } from '@/lib/auth';
import { warmDirectPgConnection } from '@/lib/db/direct-pg';
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
    // Не await: не держим TTFB на cold Neon; к моменту клика connect часто уже тёплый.
    void warmDirectPgConnection();

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
