/**
 * Scoreboard забега Survival на result.
 *
 * Pattern (roguelike / sports box score):
 * 1) hero = run total (то, что на leaderboard);
 * 2) волны = строки матча: справа вклад волны в забег («+14» или «0»),
 *    слева статус текстом с причиной — без зачёркивания: одна цифра на
 *    волну, и это ровно то, что вошло в забег;
 * 3) «эта волна» — две плитки (верных, очки волны) для разбора ниже.
 *
 * clockOk=false: очки волны не входят в totalScore — статус объясняет
 * почему, математику UI не «чинит». Canon: docs/DECISIONS.md → Survival
 * Mode MVP.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';

import type { SurvivalRunResultBoard } from '@/entities/survival-run/survival-run.repository';
import type { Dictionary, Locale } from '@/shared/i18n';
import { buttonClassName } from '@/shared/ui';

type SurvivalRunResultBoardViewProps = {
    locale: Locale;
    board: SurvivalRunResultBoard;
    currentSessionId: string;
    waveScore: number;
    waveCorrectCount: number;
    waveTotalQuestions: number;
    labels: Dictionary['survivalMode'];
    quizLabels: Dictionary['quiz'];
    playAgainAction: ReactNode;
    leaderboardHref: string;
};

type WaveStatus = 'counted' | 'counted-zero' | 'not-counted';

function getWaveStatus(wave: { clockOk: boolean; score: number }): WaveStatus {
    if (!wave.clockOk) {
        return 'not-counted';
    }

    return wave.score > 0 ? 'counted' : 'counted-zero';
}

const STATUS_TONE_CLASS: Record<WaveStatus, string> = {
    counted: 'text-success',
    'counted-zero': 'text-muted',
    'not-counted': 'text-warning',
};

function ThisWaveTile({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-md border border-border bg-surface-muted/60 px-3 py-2.5 sm:px-4 sm:py-3">
            <dt className="text-xs font-medium text-muted">{label}</dt>
            <dd className="mt-1 font-display text-2xl font-semibold tabular-nums tracking-tight text-foreground sm:text-3xl">
                {value}
            </dd>
        </div>
    );
}

export function SurvivalRunResultBoardView({
    locale,
    board,
    currentSessionId,
    waveScore,
    waveCorrectCount,
    waveTotalQuestions,
    labels,
    quizLabels,
    playAgainAction,
    leaderboardHref,
}: SurvivalRunResultBoardViewProps) {
    const correctValue = labels.thisWaveContext
        .replace('{correct}', String(waveCorrectCount))
        .replace('{total}', String(waveTotalQuestions));
    const statusLabels: Record<WaveStatus, string> = {
        counted: labels.waveCountedStatus,
        'counted-zero': labels.waveCountedZeroStatus,
        'not-counted': labels.waveNotCountedStatus,
    };

    return (
        <section
            className="rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-7"
            aria-labelledby="survival-run-score-title"
        >
            <p className="font-mono text-[0.65rem] font-medium uppercase tracking-[0.14em] text-muted">
                {labels.runScoreEyebrow}
            </p>
            <h1
                id="survival-run-score-title"
                className="mt-1 font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
            >
                {labels.runScoreTitle}
            </h1>

            <div className="mt-5 sm:mt-6">
                <p className="text-xs font-medium tracking-wide text-muted uppercase sm:text-sm">
                    {labels.runTotalLabel}
                </p>
                <p className="mt-1.5 font-display text-5xl font-semibold tabular-nums tracking-tight text-foreground sm:mt-2 sm:text-7xl">
                    {board.totalScore}
                </p>
            </div>

            {board.waves.length > 0 ? (
                <ol className="mt-5 border-t border-border sm:mt-6">
                    {board.waves.map((wave) => {
                        const isCurrent = wave.sessionId === currentSessionId;
                        const status = getWaveStatus(wave);
                        const contribution = status === 'counted' ? wave.score : 0;

                        return (
                            <li
                                key={wave.sessionId}
                                className={[
                                    'flex items-center justify-between gap-4 border-b border-border py-3 last:border-b-0 sm:py-3.5',
                                    isCurrent
                                        ? '-mx-4 border-l-2 border-l-primary bg-surface-muted/50 px-4 sm:-mx-7 sm:px-7'
                                        : '',
                                ].join(' ')}
                                aria-current={isCurrent ? 'true' : undefined}
                            >
                                <div className="min-w-0">
                                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-foreground">
                                        <span>
                                            {labels.waveLineLabel.replace(
                                                '{n}',
                                                String(wave.waveIndex),
                                            )}
                                        </span>
                                        {isCurrent ? (
                                            <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[0.65rem] font-medium tracking-wide text-primary">
                                                {labels.waveCurrentMarker}
                                            </span>
                                        ) : null}
                                    </p>
                                    <p
                                        className={[
                                            'mt-0.5 text-xs leading-snug font-medium',
                                            STATUS_TONE_CLASS[status],
                                        ].join(' ')}
                                    >
                                        {statusLabels[status]}
                                    </p>
                                </div>

                                <p
                                    className={[
                                        'shrink-0 font-display text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl',
                                        contribution > 0
                                            ? 'text-foreground'
                                            : 'text-muted',
                                    ].join(' ')}
                                >
                                    {contribution > 0
                                        ? `+${contribution}`
                                        : '0'}
                                </p>
                            </li>
                        );
                    })}
                </ol>
            ) : null}

            <div className="mt-5 border-t border-border pt-4 sm:mt-6 sm:pt-5">
                <p className="text-xs font-medium tracking-wide text-muted uppercase">
                    {labels.thisWaveLabel}
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-2 sm:gap-3">
                    <ThisWaveTile
                        label={labels.thisWaveCorrectLabel}
                        value={correctValue}
                    />
                    <ThisWaveTile
                        label={labels.thisWaveScoreLabel}
                        value={String(waveScore)}
                    />
                </dl>
            </div>

            <nav
                className="mt-6 flex flex-col gap-2 sm:mt-8 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3"
                aria-label={labels.runScoreTitle}
            >
                {playAgainAction}
                <Link
                    href={leaderboardHref}
                    className={buttonClassName({
                        variant: 'secondary',
                        className: 'w-full sm:w-auto',
                    })}
                >
                    {quizLabels.toLeaderboard}
                </Link>
                <Link
                    href={`/${locale}`}
                    className={buttonClassName({
                        variant: 'ghost',
                        className:
                            'w-full justify-center text-muted sm:w-auto sm:justify-start',
                    })}
                >
                    {quizLabels.backHome}
                </Link>
            </nav>
        </section>
    );
}
