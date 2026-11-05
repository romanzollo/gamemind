import type { RatingRecords as RatingRecordsData } from '@/entities/quiz-result/rating-points.repository';
import type { Dictionary, Locale } from '@/shared/i18n';
import { formatPlural, formatPluralWord } from '@/shared/i18n';

import type { RatingPeriod } from '../lib/rating-week';

/**
 * Рекорды периода — второй уровень рейтинга (ADR «Weekly rating points»):
 * лучший Блиц (очки и время) и лучший забег Выживания. Рекорд Классики не
 * показываем — он упирается в 30; доска дня есть на главной.
 *
 * Плитка — «табло» по центру, каждая величина на своей строке: режим →
 * крупное число → слово «очков» → плашка времени / волн → рекордсмен под
 * чертой. Так число не сливается с секундами («9 23 с»). Плитки одной
 * высоты; пустая держит текст по центру.
 */

type RatingRecordsProps = {
    locale: Locale;
    period: RatingPeriod;
    records: RatingRecordsData;
    labels: Dictionary['leaderboard'];
};

type RecordCardProps = {
    title: string;
    emptyText: string;
    record: {
        value: number;
        /** Слово под числом: «очков» / «points». */
        unit: string;
        /** Плашка: «23 с», «2 волны». */
        detail: string;
        holder: string;
    } | null;
};

function RecordCard({ title, emptyText, record }: RecordCardProps) {
    return (
        <div className="flex h-full flex-col items-center rounded-lg border border-border bg-surface px-3 pb-3 pt-4 text-center shadow-sm sm:px-4">
            <h3 className="font-mono text-2xs font-medium uppercase tracking-[0.14em] text-muted">
                {title}
            </h3>
            {record ? (
                <>
                    <p className="mt-3 font-display text-4xl font-semibold leading-none tabular-nums">
                        {record.value}
                    </p>
                    <p className="mt-1 text-xs text-muted">{record.unit}</p>
                    <p className="mt-2 rounded-full bg-surface-muted px-2.5 py-0.5 font-mono text-xs font-medium tabular-nums">
                        {record.detail}
                    </p>
                    <p className="mt-3 w-full truncate border-t border-border pt-2.5 text-sm font-semibold">
                        {record.holder}
                    </p>
                </>
            ) : (
                <p className="flex flex-1 items-center py-4 text-sm text-muted">
                    {emptyText}
                </p>
            )}
        </div>
    );
}

export function RatingRecords({
    locale,
    period,
    records,
    labels,
}: RatingRecordsProps) {
    const title =
        period === 'week'
            ? labels.recordsWeek
            : period === 'lastWeek'
              ? labels.recordsLast
              : labels.recordsAll;
    const { blitz, survival } = records;

    return (
        <section className="mt-8">
            <h2 className="font-display text-xl font-semibold">{title}</h2>
            <div className="mt-3 grid grid-cols-2 gap-3">
                <RecordCard
                    title={labels.modeBlitz}
                    emptyText={labels.recordEmpty}
                    record={
                        blitz
                            ? {
                                  value: blitz.score,
                                  unit: formatPluralWord(
                                      locale,
                                      blitz.score,
                                      labels.pointsCount,
                                  ),
                                  detail: labels.recordSeconds.replace(
                                      '{n}',
                                      String(blitz.seconds),
                                  ),
                                  holder: blitz.username,
                              }
                            : null
                    }
                />
                <RecordCard
                    title={labels.modeSurvival}
                    emptyText={labels.recordEmpty}
                    record={
                        survival
                            ? {
                                  value: survival.score,
                                  unit: formatPluralWord(
                                      locale,
                                      survival.score,
                                      labels.pointsCount,
                                  ),
                                  detail: formatPlural(
                                      locale,
                                      survival.waves,
                                      labels.recordWaves,
                                  ),
                                  holder: survival.username,
                              }
                            : null
                    }
                />
            </div>
        </section>
    );
}
