/**
 * Отчёт воронки для владельца (ROADMAP 3.5c): визиты новичков и своих,
 * источники, партии по режимам, регистрации, возвраты — за 7 / 14 / 30 дней.
 *
 * Только админ (`requireAdmin`). Данные — `findFunnelReport`: чтение на
 * pooled-соединении, горячий путь квиза не трогает. Сбой чтения — плашка
 * «не загрузился», а не 500: отчёт вторичен, админка должна открываться.
 *
 * Canon: docs/DECISIONS.md → Funnel analytics: own events + existing tables.
 */

import Link from 'next/link';

import {
    findFunnelReport,
    FUNNEL_PERIOD_DAYS,
    isFunnelPeriodDays,
    type FunnelGameMode,
    type FunnelPeriodDays,
    type FunnelReport,
    type FunnelVisitSegment,
} from '@/entities/admin/admin-funnel.repository';
import { requireAdmin } from '@/lib/auth/guards';
import { getDictionary, isLocale, type Dictionary } from '@/shared/i18n';

export const dynamic = 'force-dynamic';

type FunnelPageProps = {
    params: Promise<{ locale: string }>;
    searchParams: Promise<{ days?: string }>;
};

type FunnelLabels = Dictionary['admin']['funnel'];

const DEFAULT_PERIOD: FunnelPeriodDays = 14;
const GAME_MODES: FunnelGameMode[] = ['classic', 'blitz', 'survival', 'daily', 'challenge'];

const sectionClassName =
    'mt-5 rounded-lg border border-border bg-surface p-4 shadow-sm sm:mt-6 sm:p-6';
const sectionTitleClassName =
    'font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl';
const thClassName =
    'py-2 pr-3 text-left align-bottom text-2xs font-medium normal-case tracking-normal text-muted sm:uppercase sm:tracking-[0.08em]';
const numThClassName = `${thClassName} text-right pr-0 pl-2 sm:pl-3`;
const tdClassName = 'py-2 pr-2 text-left text-sm text-foreground sm:pr-3';
const numTdClassName =
    'py-2 pl-2 text-right font-mono text-sm tabular-nums text-foreground sm:pl-3';

/** `{name}` → значение. Плейсхолдеры словаря подставляем здесь, а не в JSX. */
function fill(template: string, values: Record<string, number | string>): string {
    return template.replace(/\{(\w+)\}/g, (match, key: string) =>
        key in values ? String(values[key]) : match,
    );
}

function percent(part: number, whole: number): string {
    return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—';
}

function parsePeriod(raw: string | undefined): FunnelPeriodDays {
    const days = Number(raw);
    return isFunnelPeriodDays(days) ? days : DEFAULT_PERIOD;
}

function VisitsTable({
    labels,
    newcomers,
    returning,
}: {
    labels: FunnelLabels;
    newcomers: FunnelVisitSegment;
    returning: FunnelVisitSegment;
}) {
    const rows: Array<[string, keyof FunnelVisitSegment]> = [
        [labels.visitsVisited, 'visits'],
        [labels.visitsDemo, 'demoAnswered'],
        [labels.visitsModeOpened, 'modeOpened'],
        [labels.visitsAuthPage, 'authPageViewed'],
        [labels.visitsStarted, 'gameStarted'],
        [labels.visitsFinished, 'gameCompleted'],
        [labels.visitsShared, 'shared'],
    ];

    return (
        <div className="mt-3 overflow-x-auto">
            <table className="w-full table-fixed border-collapse">
                <thead>
                    <tr className="border-b border-border">
                        <th scope="col" className={`${thClassName} w-[30%]`}>
                            <span className="sr-only">{labels.visitsTitle}</span>
                        </th>
                        <th scope="col" className={numThClassName} colSpan={2}>
                            {labels.visitsNewcomers}
                        </th>
                        <th scope="col" className={numThClassName} colSpan={2}>
                            {labels.visitsReturning}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(([label, key]) => (
                        <tr key={key} className="border-b border-border last:border-b-0">
                            <th scope="row" className={`${tdClassName} font-normal`}>
                                {label}
                            </th>
                            <td className={numTdClassName}>{newcomers[key]}</td>
                            <td className={`${numTdClassName} text-muted`}>
                                {key === 'visits' ? '' : percent(newcomers[key], newcomers.visits)}
                            </td>
                            <td className={numTdClassName}>{returning[key]}</td>
                            <td className={`${numTdClassName} text-muted`}>
                                {key === 'visits' ? '' : percent(returning[key], returning.visits)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <p className="mt-2 text-xs text-muted">{labels.visitsPercentHint}</p>
        </div>
    );
}

function ReportBody({ labels, report }: { labels: FunnelLabels; report: FunnelReport }) {
    const noVisits =
        report.visitsAnonymous.visits + report.visitsSignedIn.visits === 0;

    return (
        <>
            <section className={sectionClassName} aria-labelledby="funnel-visits">
                <h2 id="funnel-visits" className={sectionTitleClassName}>
                    {labels.visitsTitle}
                </h2>
                {noVisits ? (
                    <p className="mt-3 text-sm text-muted">{labels.empty}</p>
                ) : (
                    <VisitsTable
                        labels={labels}
                        newcomers={report.visitsAnonymous}
                        returning={report.visitsSignedIn}
                    />
                )}
            </section>

            {report.sources.length > 0 ? (
                <section className={sectionClassName} aria-labelledby="funnel-sources">
                    <h2 id="funnel-sources" className={sectionTitleClassName}>
                        {labels.sourcesTitle}
                    </h2>
                    <div className="mt-3 overflow-x-auto">
                        <table className="w-full table-fixed border-collapse">
                            <thead>
                                <tr className="border-b border-border">
                                    <th scope="col" className={`${thClassName} w-[30%]`}>
                                        {labels.sourcesSource}
                                    </th>
                                    <th scope="col" className={numThClassName}>
                                        {labels.sourcesVisits}
                                    </th>
                                    <th scope="col" className={numThClassName}>
                                        {labels.sourcesStarted}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {report.sources.map((row) => (
                                    <tr
                                        key={row.source}
                                        className="border-b border-border last:border-b-0"
                                    >
                                        <td className={`${tdClassName} break-all font-mono`}>
                                            {row.source === 'direct'
                                                ? labels.sourceDirect
                                                : row.source}
                                        </td>
                                        <td className={numTdClassName}>{row.visits}</td>
                                        <td className={numTdClassName}>{row.gameStarted}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            ) : null}

            <section className={sectionClassName} aria-labelledby="funnel-games">
                <h2 id="funnel-games" className={sectionTitleClassName}>
                    {labels.gamesTitle}
                </h2>
                <div className="mt-3 overflow-x-auto">
                    <table className="w-full table-fixed border-collapse">
                        <thead>
                            <tr className="border-b border-border">
                                <th scope="col" className={`${thClassName} w-[30%]`}>
                                    <span className="sr-only">{labels.gamesTitle}</span>
                                </th>
                                <th scope="col" className={numThClassName}>
                                    {labels.gamesStarted}
                                </th>
                                <th scope="col" className={numThClassName}>
                                    {labels.gamesAnswered}
                                </th>
                                <th scope="col" className={numThClassName}>
                                    {labels.gamesFinished}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {GAME_MODES.map((mode) => {
                                const row = report.gamesByMode[mode];
                                return (
                                    <tr key={mode} className="border-b border-border">
                                        <th scope="row" className={`${tdClassName} font-normal`}>
                                            {labels.modes[mode]}
                                        </th>
                                        <td className={numTdClassName}>{row.started}</td>
                                        <td className={numTdClassName}>{row.answered}</td>
                                        <td className={numTdClassName}>{row.completed}</td>
                                    </tr>
                                );
                            })}
                            <tr>
                                <th scope="row" className={`${tdClassName} font-semibold`}>
                                    {labels.gamesTotal}
                                </th>
                                <td className={`${numTdClassName} font-semibold`}>
                                    {report.gamesTotal.started}
                                </td>
                                <td className={`${numTdClassName} font-semibold`}>
                                    {report.gamesTotal.answered}
                                </td>
                                <td className={`${numTdClassName} font-semibold`}>
                                    {report.gamesTotal.completed}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <ul className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm text-foreground">
                    <li>{fill(labels.players, report.players)}</li>
                    <li>{fill(labels.replay, report.replay)}</li>
                    <li>{fill(labels.challenges, report.challenges)}</li>
                </ul>
            </section>

            <section className={sectionClassName} aria-labelledby="funnel-signups">
                <h2 id="funnel-signups" className={sectionTitleClassName}>
                    {labels.signupsTitle}
                </h2>
                <ul className="mt-3 space-y-1.5 text-sm text-foreground">
                    <li>
                        {fill(labels.signupsTotal, {
                            total: report.signups.total,
                            fromGuest: report.signups.fromGuest,
                        })}
                    </li>
                    <li className="font-mono tabular-nums text-muted">
                        {labels.signupsPassword} {report.signups.byMethod.password} ·{' '}
                        {labels.signupsYandex} {report.signups.byMethod.yandex} ·{' '}
                        {labels.signupsVk} {report.signups.byMethod.vk}
                    </li>
                    <li>
                        {fill(labels.signupsGuestMerged, {
                            merged: report.signups.guestMerged,
                        })}
                    </li>
                </ul>
            </section>

            <section className={sectionClassName} aria-labelledby="funnel-retention">
                <h2 id="funnel-retention" className={sectionTitleClassName}>
                    {labels.retentionTitle}
                </h2>
                <ul className="mt-3 space-y-1.5 text-sm text-foreground">
                    <li>
                        {fill(labels.retentionNewPlayers, {
                            count: report.retention.newPlayers,
                        })}
                    </li>
                    <li>
                        {fill(labels.retentionNextDay, {
                            returned: report.retention.d1Returned,
                            eligible: report.retention.d1Eligible,
                        })}
                    </li>
                    <li>
                        {fill(labels.retentionWeek, {
                            returned: report.retention.w1Returned,
                            eligible: report.retention.w1Eligible,
                        })}
                    </li>
                </ul>
            </section>
        </>
    );
}

export default async function AdminFunnelPage({ params, searchParams }: FunnelPageProps) {
    const { locale } = await params;
    const safeLocale = isLocale(locale) ? locale : 'ru';
    await requireAdmin(safeLocale);

    const labels = getDictionary(safeLocale).admin.funnel;
    const period = parsePeriod((await searchParams).days);

    let report: FunnelReport | null = null;
    try {
        report = await findFunnelReport(period);
    } catch (loadError) {
        // console.warn: console.error в Server Component поднимает redbox в dev.
        if (process.env.NODE_ENV === 'development') {
            console.warn(
                '[admin/funnel] findFunnelReport failed:',
                loadError instanceof Error ? loadError.message : loadError,
            );
        }
    }

    return (
        <main className="mx-auto max-w-3xl px-4 py-5 sm:px-8 sm:py-10">
            <header className="border-b border-border pb-5 sm:pb-6">
                <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                    {labels.title}
                </h1>
                <p className="mt-2 text-sm text-muted sm:text-base">{labels.subtitle}</p>

                <nav aria-label={labels.periodLabel} className="mt-4 flex flex-wrap gap-2">
                    {FUNNEL_PERIOD_DAYS.map((days) => {
                        const active = days === period;
                        return (
                            <Link
                                key={days}
                                href={`/${safeLocale}/admin/funnel?days=${days}`}
                                aria-current={active ? 'page' : undefined}
                                className={`inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                                    active
                                        ? 'border-primary bg-primary/10 text-primary'
                                        : 'border-border bg-surface text-foreground hover:bg-surface-hover'
                                }`}
                            >
                                {fill(labels.periodDays, { days })}
                            </Link>
                        );
                    })}
                </nav>
            </header>

            {report ? (
                <ReportBody labels={labels} report={report} />
            ) : (
                <p
                    className="mt-5 rounded-md border border-dashed border-border bg-surface-muted/60 px-4 py-3 text-sm text-muted"
                    role="status"
                >
                    {labels.loadFailed}
                </p>
            )}
        </main>
    );
}
