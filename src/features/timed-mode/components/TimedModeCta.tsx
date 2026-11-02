/**
 * Server CTA Timed Mode: optional auth → компактная карточка лобби.
 *
 * Живёт на mode lobby `/quiz`. Presentation only.
 * Дедлайн / snapshot пишет `startTimedQuizAction`.
 * Canon: docs/DECISIONS.md → Timed Mode MVP.
 */

import { TimedModeCtaPanel } from '@/features/timed-mode/components/TimedModeCtaPanel';
import { auth } from '@/lib/auth';
import type { Dictionary, Locale } from '@/shared/i18n';
import type { QuizSetupDifficulty } from '@/types';

type TimedModeCtaProps = {
    locale: Locale;
    dictionary: Dictionary;
    className?: string;
    /** Последний выбор сложности (cookie лобби). */
    initialDifficulty: QuizSetupDifficulty;
};

export async function TimedModeCta({
    locale,
    dictionary,
    className = '',
    initialDifficulty,
}: TimedModeCtaProps) {
    const session = await auth();

    return (
        <div className={className}>
            <TimedModeCtaPanel
                locale={locale}
                dictionary={dictionary}
                isAuthenticated={Boolean(session?.user?.id)}
                initialDifficulty={initialDifficulty}
            />
        </div>
    );
}
