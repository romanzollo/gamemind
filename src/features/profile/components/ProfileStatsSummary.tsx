import type { Dictionary } from '@/shared/i18n';
import { EmptyState, InlineAlert } from '@/shared/ui';

import type { ProfileStats } from '../types/profile-stats';

/**
 * Сводка профиля (Scoreboard Editorial): 4 метрики или empty/error.
 *
 * Presentation only — данные уже посчитаны на сервере (`findStatsByUserId`).
 * Заголовок секции рендерит page.tsx (как у истории).
 *
 * Вёрстка (canon):
 * - default/sm/md: компактный grid 2×2 на всю ширину колонки, label над value;
 * - lg+: один ряд из 4; дата-колонка шире (`minmax`);
 * - все value в одном ритме (`font-display` + tabular-nums) — дата не mono.
 * - Не `max-w-*` на mid: узкая карточка слева + пустота справа хуже полного 2×2.
 *
 * Не list-rows «подпись | значение» на всю ширину — это регресс на mid-width.
 */

type ProfileStatsSummaryProps = {
    /** null = загрузка с Neon не удалась (не путать с «ещё не играл»). */
    stats: ProfileStats | null;
    locale: string;
    labels: Dictionary['profile'];
};

/** Ячейка: колонка label→value; min-w-0 чтобы длинная дата не раздувала fr. */
const cellClassName = 'flex min-w-0 flex-col gap-0.5';

/** Короткие labels (Рекорд / Record) — без min-h, иначе пустота над цифрой. */
const labelClassName =
    'text-[0.65rem] font-medium uppercase leading-none tracking-[0.04em] text-muted sm:text-[0.6875rem] lg:text-xs lg:leading-tight';

/** Единый value-ритм для чисел и даты — без отдельного mono для lastPlayed. */
const valueClassName =
    'font-display text-[0.9375rem] font-semibold tabular-nums tracking-wide text-foreground sm:text-base lg:text-xl';

export function ProfileStatsSummary({
    stats,
    locale,
    labels,
}: ProfileStatsSummaryProps) {
    if (stats === null) {
        return (
            <InlineAlert className="mt-3" tone="warning" role="status">
                {labels.statsLoadFailed}
            </InlineAlert>
        );
    }

    if (stats.quizzesCompleted === 0) {
        return <EmptyState className="mt-3" title={labels.statsEmpty} />;
    }

    const lastPlayedText =
        stats.lastPlayedAt === null
            ? '—'
            : stats.lastPlayedAt.toLocaleDateString(locale, {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
              });

    const accuracyText =
        stats.averageAccuracyPercent === null
            ? '—'
            : `${stats.averageAccuracyPercent}%`;

    const bestScoreText =
        stats.bestScore === null ? '—' : String(stats.bestScore);

    const rows = [
        {
            key: 'played',
            label: labels.statsQuizzesCompleted,
            value: String(stats.quizzesCompleted),
            dateTime: null as string | null,
        },
        {
            key: 'best',
            label: labels.statsBestScore,
            value: bestScoreText,
            dateTime: null,
        },
        {
            key: 'accuracy',
            label: labels.statsAverageAccuracy,
            value: accuracyText,
            dateTime: null,
        },
        {
            key: 'last',
            label: labels.statsLastPlayed,
            value: lastPlayedText,
            dateTime: stats.lastPlayedAt?.toISOString() ?? null,
        },
    ] as const;

    return (
        <dl
            className={[
                'mt-3 w-full overflow-hidden border border-border border-l-4 border-l-primary bg-surface',
                /* 2×2 до lg — на всю ширину (как identity / achievements). */
                'grid grid-cols-2 gap-x-4 gap-y-2.5 px-3 py-2 sm:gap-x-6 sm:px-3.5 sm:py-2.5 md:gap-x-8',
                /* lg: 4 в ряд; дата чуть шире. */
                'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.5fr)] lg:gap-x-5 lg:gap-y-0 lg:px-5 lg:py-3.5',
            ].join(' ')}
        >
            {rows.map((row) => (
                <div key={row.key} className={cellClassName}>
                    <dt className={labelClassName}>{row.label}</dt>
                    <dd
                        className={`${valueClassName}${row.key === 'last' ? ' whitespace-nowrap' : ''}`}
                    >
                        {row.dateTime ? (
                            <time dateTime={row.dateTime}>{row.value}</time>
                        ) : (
                            row.value
                        )}
                    </dd>
                </div>
            ))}
        </dl>
    );
}
