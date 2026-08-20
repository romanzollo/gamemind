/**
 * Scoreboard забега Survival на result.
 *
 * Pattern (roguelike / endless runs): hero = run total (то, что на доске),
 * ниже — строки волн, ещё ниже — эта волна как контекст разбора.
 * Scoreboard Editorial: caps eyebrow, mono tabular, hairline — без card soup.
 *
 * Canon: docs/DECISIONS.md → Survival Mode MVP (board = totalScore).
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
                <p className="font-display mt-1.5 text-4xl font-semibold tabular-nums tracking-tight text-foreground sm:mt-2 sm:text-6xl">
                    {board.totalScore}
                </p>
            </div>

            {board.waves.length > 0 ? (
                <ol className="mt-5 space-y-2 border-t border-border pt-4 sm:mt-6">
                    {board.waves.map((wave) => {
                        const isCurrent = wave.sessionId === currentSessionId;
                        const waveTitle = labels.waveLineLabel.replace(
                            '{n}',
                            String(wave.waveIndex),
                        );

                        return (
                            <li
                                key={wave.sessionId}
                                className="flex items-baseline justify-between gap-3 text-sm"
                            >
                                <span
                                    className={
                                        isCurrent
                                            ? 'font-medium text-foreground'
                                            : 'text-muted'
                                    }
                                >
                                    {waveTitle}
                                    {!wave.clockOk ? (
                                        <span className="ml-2 font-mono text-[0.65rem] uppercase tracking-wide text-muted">
                                            {labels.waveNotCounted}
                                        </span>
                                    ) : null}
                                </span>
                                <span className="font-mono tabular-nums text-foreground">
                                    {wave.score}
                                </span>
                            </li>
                        );
                    })}
                </ol>
            ) : null}

            <div className="mt-5 border-t border-border pt-4 sm:mt-6">
                <p className="text-xs font-medium tracking-wide text-muted uppercase">
                    {labels.thisWaveLabel}
                </p>
                <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-foreground sm:text-3xl">
                    {waveScoreText}
                </p>
                <p className="mt-2 text-sm text-muted">
                    <span className="font-medium text-foreground">
                        {quizLabels.correctAnswersLabel}
                    </span>
                    {': '}
                    <span className="tabular-nums font-semibold text-foreground">
                        {waveCorrectCount} / {waveTotalQuestions}
                    </span>
                </p>
            </div>

            <nav
                className="mt-6 flex flex-col gap-2.5 sm:mt-8 sm:flex-row sm:flex-wrap sm:gap-3 sm:items-start"
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
                        className: 'w-full sm:w-auto',
                    })}
                >
                    {quizLabels.backHome}
                </Link>
            </nav>
        </section>
    );
}
