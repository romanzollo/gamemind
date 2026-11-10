/**
 * Server CTA Timed Mode: optional auth → компактная карточка режима.
 *
 * Карточка режима на главной (место игры). Presentation only.
 * Дедлайн / snapshot пишет `startTimedQuizAction`.
 * Canon: docs/DECISIONS.md → Timed Mode MVP.
 */

import { TimedModeCtaPanel } from '@/features/timed-mode/components/TimedModeCtaPanel';
import { auth } from '@/lib/auth';
import type { Dictionary, Locale } from '@/shared/i18n';
import type { BlitzSetup } from '@/features/quiz/lib/mode-setup-memory';

type TimedModeCtaProps = {
    locale: Locale;
    dictionary: Dictionary;
    className?: string;
    /** Последний выбор сложности и темы (cookie шторки). */
    initialSetup: BlitzSetup;
    /** «Музыкальные вопросы» из cookie устройства (сервер, главная). */
    initialMusicEnabled: boolean;
};

export async function TimedModeCta({
    locale,
    dictionary,
    className = '',
    initialSetup,
    initialMusicEnabled,
}: TimedModeCtaProps) {
    const session = await auth();

    return (
        <div className={className}>
            <TimedModeCtaPanel
                locale={locale}
                dictionary={dictionary}
                isAuthenticated={Boolean(session?.user?.id)}
                initialSetup={initialSetup}
                initialMusicEnabled={initialMusicEnabled}
            />
        </div>
    );
}
