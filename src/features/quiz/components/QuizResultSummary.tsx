import Link from 'next/link';
import type { ReactNode } from 'react';

import {
    getSessionDifficultyChipToneClass,
    getSessionDifficultyLabel,
} from '@/features/quiz/lib/session-difficulty-label';
import type { QuizSetupDifficulty } from '@/features/quiz/types';
import type { Dictionary, Locale } from '@/shared/i18n';
import { buttonClassName } from '@/shared/ui';

type QuizResultSummaryProps = {
    locale: Locale;
    score: number;
    maxPossibleScore: number | null;
    correctCount: number;
    totalQuestions: number;
    setupDifficulty: QuizSetupDifficulty;
    labels: Dictionary['quiz'];
    /**
     * Primary CTA: ClassicRematchButton или TimedRematchButton.
     * Rematch = сразу новая партия с теми же правилами сессии.
     */
    playAgainAction: ReactNode;
};

/**
 * Presentational scoreboard for the result page.
 * Displays server-provided numbers only — does not recalculate score.
 */
export function QuizResultSummary({
    locale,
    score,
    maxPossibleScore,
    correctCount,
    totalQuestions,
    setupDifficulty,
    labels,
    playAgainAction,
}: QuizResultSummaryProps) {
    const scoreText =
        maxPossibleScore != null && maxPossibleScore > 0
            ? `${score} / ${maxPossibleScore}`
            : String(score);
    const difficultyLabel = getSessionDifficultyLabel(setupDifficulty, {
        easy: labels.easy,
        medium: labels.medium,
        hard: labels.hard,
        mixed: labels.mixed,
    });

    return (
        <section
            className="rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-7"
            aria-labelledby="quiz-result-summary-title"
        >
            <h1
                id="quiz-result-summary-title"
                className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-4xl"
            >
                {labels.resultTitle}
            </h1>

            {/* Чип сессии: MIXED = «Смешанная», не Medium. */}
            <p className="mt-2">
                <span
                    className={`inline-flex items-center rounded-sm bg-surface-muted px-2 py-0.5 text-[11px] font-semibold tracking-wide ${getSessionDifficultyChipToneClass(setupDifficulty)}`}
                >
                    {difficultyLabel}
                </span>
            </p>

            <div className="mt-5 sm:mt-8">
                <p className="text-xs font-medium tracking-wide text-muted uppercase sm:text-sm">
                    {labels.scoreLabel}
                </p>
                <p className="font-display mt-1.5 text-4xl font-semibold tabular-nums tracking-tight text-foreground sm:mt-2 sm:text-6xl">
                    {scoreText}
                </p>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-muted sm:mt-4 sm:text-lg">
                <span className="font-medium text-foreground">
                    {labels.correctAnswersLabel}
                </span>
                {': '}
                <span className="tabular-nums font-semibold text-foreground">
                    {correctCount} / {totalQuestions}
                </span>
            </p>

            <nav
                className="mt-6 flex flex-col gap-2.5 sm:mt-8 sm:flex-row sm:flex-wrap sm:gap-3 sm:items-start"
                aria-label={labels.resultTitle}
            >
                {playAgainAction}
                <Link
                    href={`/${locale}/leaderboard`}
                    className={buttonClassName({
                        variant: 'secondary',
                        className: 'w-full sm:w-auto',
                    })}
                >
                    {labels.toLeaderboard}
                </Link>
                <Link
                    href={`/${locale}`}
                    className={buttonClassName({
                        variant: 'ghost',
                        className: 'w-full sm:w-auto',
                    })}
                >
                    {labels.backHome}
                </Link>
            </nav>
        </section>
    );
}
