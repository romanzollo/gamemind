import type { Locale } from '@/shared/i18n';
import { PendingLink } from '@/shared/ui';

import { buildRatingHref } from '../lib/rating-period-params';
import type { RatingPeriod } from '../lib/rating-week';

/**
 * Единственный переключатель страницы рейтинга — период (ADR «Weekly rating
 * points»). Ссылки, а не форма: период живёт в URL, страница серверная.
 */

type RatingPeriodSwitchProps = {
    locale: Locale;
    period: RatingPeriod;
    labels: {
        periodLabel: string;
        periodWeek: string;
        periodLast: string;
        periodAll: string;
    };
};

export function RatingPeriodSwitch({
    locale,
    period,
    labels,
}: RatingPeriodSwitchProps) {
    const options: Array<{ value: RatingPeriod; label: string }> = [
        { value: 'week', label: labels.periodWeek },
        { value: 'lastWeek', label: labels.periodLast },
        { value: 'all', label: labels.periodAll },
    ];

    return (
        <nav
            aria-label={labels.periodLabel}
            className="mt-4 grid grid-cols-3 gap-1 rounded-md border border-border bg-surface p-1"
        >
            {options.map((option) => {
                const isActive = option.value === period;

                return (
                    <PendingLink
                        key={option.value}
                        href={buildRatingHref(locale, option.value)}
                        aria-current={isActive ? 'page' : undefined}
                        className={[
                            'min-h-11 justify-center whitespace-nowrap rounded-sm px-2 text-center text-sm font-semibold',
                            'motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                            isActive
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted hover:bg-surface-hover hover:text-foreground',
                        ].join(' ')}
                    >
                        {option.label}
                    </PendingLink>
                );
            })}
        </nav>
    );
}
