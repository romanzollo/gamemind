/**
 * Scoreboard забега Survival на result.
 *
 * Pattern (roguelike / sports box score):
 * 1) hero = run total (то, что на leaderboard);
 * 2) волны = строки матча: статус текстом, попытка ≠ вклад в забег;
 * 3) «эта волна» — компактный context для разбора (верных N/M), не второй hero.
 *
 * Cut / clockOk=false: очки волны не входят в totalScore — UI это объясняет,
 * математику не «чинит». Canon: docs/DECISIONS.md → Survival Mode MVP.
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
    waveMaxPossibleScore: number | null;
    waveCorrectCount: number;
    waveTotalQuestions: number;
    labels: Dictionary['survivalMode'];
    quizLabels: Dictionary['quiz'];
    playAgainAction: ReactNode;
    leaderboardHref: string;
};

export function SurvivalRunResultBoardView({
    locale,
    board,
    currentSessionId,
    waveScore,
    waveMaxPossibleScore,
    waveCorrectCount,
    waveTotalQuestions,
    labels,
    quizLabels,
    playAgainAction,
    leaderboardHref,
}: SurvivalRunResultBoardViewProps) {
    const waveScoreText =
        waveMaxPossibleScore != null && waveMaxPossibleScore > 0
            ? `${waveScore} / ${waveMaxPossibleScore}`
            : String(waveScore);
    const thisWaveContext = labels.thisWaveContext
        .replace('{score}', waveScoreText)
        .replace('{correct}', String(waveCorrectCount))
        .replace('{total}', String(waveTotalQuestions));

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
                <p className="font-display mt-1.5 text-4xl font-semibold tabular-nums tracking-tight text-foreground motion-safe:transition-opacity sm:mt-2 sm:text-6xl">
                    {board.totalScore}
                </p>
            </div>

            {board.waves.length > 0 ? (
                <ol className="mt-5 border-t border-border sm:mt-6">
                    {board.waves.map((wave) => {
                        const isCurrent = wave.sessionId === currentSessionId;
                        const contribution = wave.clockOk ? wave.score : 0;
                        const waveTitle = labels.waveLineLabel.replace(
                            '{n}',
                            String(wave.waveIndex),
                        );
                        const statusLabel = !wave.clockOk
                            ? labels.waveNotCountedStatus
                            : wave.score === 0
                              ? labels.waveCountedZeroStatus
                              : labels.waveCountedStatus;
                        const contributionLabel =
                            labels.waveRunContributionLabel.replace(
                                '{n}',
                                String(contribution),
                            );
                        const statusToneClass = !wave.clockOk
                            ? 'text-muted'
                            : wave.score === 0
                              ? 'text-muted'
                              : 'text-success';

                        return (
                            <li
                                key={wave.sessionId}
                                className={[
                                    'border-b border-border py-3 last:border-b-0 sm:py-3.5',
                                    isCurrent
                                        ? '-mx-4 border-l-2 border-l-primary bg-surface-muted/50 px-4 sm:-mx-7 sm:px-7'
                                        : '',
                                ].join(' ')}
                                aria-current={isCurrent ? 'true' : undefined}
                            >
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                                    <div className="min-w-0">
                                        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm font-medium text-foreground">
                                            <span>{waveTitle}</span>
                                            {isCurrent ? (
                                                <span className="font-mono text-[0.7rem] font-medium tracking-wide text-primary">
                                                    {labels.waveCurrentMarker}
                                                </span>
                                            ) : null}
                                        </p>
                                        <p
                                            className={[
                                                'mt-0.5 text-xs font-medium',
                                                statusToneClass,
                                            ].join(' ')}
                                        >
                                            {statusLabel}
                                        </p>
                                    </div>

                                    <div className="flex min-w-30 flex-col gap-0.5 sm:items-end">
                                        <p className="flex w-full items-baseline justify-between gap-3 text-sm sm:justify-end sm:gap-4">
                                            <span className="text-muted">
                                                {labels.waveAttemptLabel}
                                            </span>
                                            <span
                                                className={[
                                                    'font-mono tabular-nums',
                                                    wave.clockOk
                                                        ? 'text-foreground'
                                                        : 'text-muted line-through',
                                                ].join(' ')}
                                            >
                                                {wave.score}
                                            </span>
                                        </p>
                                        {/* Дубль «к забегу N» только если вклад ≠ попытка (cut / 0). */}
                                        {contribution !== wave.score ? (
                                            <p className="font-mono text-xs tabular-nums text-muted sm:text-right">
                                                {contributionLabel}
                                            </p>
                                        ) : null}
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ol>
            ) : null}

            <div className="mt-4 border-t border-border pt-3 sm:mt-5 sm:pt-4">
                <p className="text-xs font-medium tracking-wide text-muted uppercase">
                    {labels.thisWaveLabel}
                </p>
                <p className="mt-1 text-sm tabular-nums text-foreground">
                    {thisWaveContext}
                </p>
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
