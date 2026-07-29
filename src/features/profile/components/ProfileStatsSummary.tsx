import type { Dictionary } from '@/shared/i18n';
import { EmptyState, InlineAlert } from '@/shared/ui';

import type { ProfileStats } from '../types/profile-stats';

/**
 * Сводка профиля (Scoreboard Editorial): 4 метрики или empty/error.
 *
 * Presentation only — данные уже посчитаны на сервере (`findStatsByUserId`).
 * Заголовок секции рендерит page.tsx (как у истории).
 *
 * Вёрстка: 2×2 до lg (на 320–768px 4 колонки ломают подписи/дату),
 * lg+ — ряд из 4; акцент border-l-primary как на admin hub.
 */

type ProfileStatsSummaryProps = {
    /** null = загрузка с Neon не удалась (не путать с «ещё не играл»). */
    stats: ProfileStats | null;
    locale: string;
    labels: Dictionary['profile'];
};

const labelClassName =
    'text-xs font-medium uppercase leading-snug tracking-[0.06em] text-muted';

const valueClassName =
    'mt-1.5 block font-display text-xl font-semibold tabular-nums tracking-wide text-foreground sm:text-2xl';

const cellClassName = 'min-w-0';

export function ProfileStatsSummary({
    stats,
    locale,
    labels,
}: ProfileStatsSummaryProps) {
    if (stats === null) {
        return (
            <InlineAlert className="mt-4" tone="warning" role="status">
                {labels.statsLoadFailed}
            </InlineAlert>
        );
    }

    if (stats.quizzesCompleted === 0) {
        return <EmptyState className="mt-4" title={labels.statsEmpty} />;
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

    return (
        <dl
            className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 border border-border border-l-4 border-l-primary bg-surface px-3.5 py-4 sm:gap-x-6 sm:px-5 sm:py-5 lg:grid-cols-4 lg:gap-x-5"
        >
            <div className={cellClassName}>
                <dt className={labelClassName}>
                    {labels.statsQuizzesCompleted}
                </dt>
                <dd className={valueClassName}>{stats.quizzesCompleted}</dd>
            </div>
            <div className={cellClassName}>
                <dt className={labelClassName}>{labels.statsBestScore}</dt>
                <dd className={valueClassName}>{bestScoreText}</dd>
            </div>
            <div className={cellClassName}>
                <dt className={labelClassName}>
                    {labels.statsAverageAccuracy}
                </dt>
                <dd className={valueClassName}>{accuracyText}</dd>
            </div>
            <div className={cellClassName}>
                <dt className={labelClassName}>{labels.statsLastPlayed}</dt>
                <dd className="mt-1.5 block font-mono text-base font-medium tabular-nums tracking-tight text-foreground sm:text-lg">
                    {stats.lastPlayedAt ? (
                        <time dateTime={stats.lastPlayedAt.toISOString()}>
                            {lastPlayedText}
                        </time>
                    ) : (
                        lastPlayedText
                    )}
                </dd>
            </div>
        </dl>
    );
}
