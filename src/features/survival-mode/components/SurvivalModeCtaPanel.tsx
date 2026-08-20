'use client';

/**
 * Клиентская панель Survival Mode (Scoreboard Editorial).
 *
 * Зачем Client: форма start (useActionState) + difficulty select + pending.
 * Auth решает Server parent; гость видит login, не «битую» кнопку.
 * Mix в MVP нет — Zod режет MIXED, select его не предлагает.
 * Start CTA = primary, как Blitz/Classic: равная арена, не secondary-ghost.
 * Presentation only. Полный Taste polish / «рекорд волны» — не этот срез.
 * Canon: docs/DECISIONS.md → Survival Mode MVP.
 */

import { useActionState, useState } from 'react';

import { getQuizErrorMessage } from '@/features/quiz/lib/get-quiz-error-message';
import { startSurvivalQuizAction } from '@/features/survival-mode/actions';
import type { SurvivalDifficulty } from '@/features/survival-mode/types';
import type { Dictionary, Locale } from '@/shared/i18n';
import {
    InlineAlert,
    PendingLink,
    SubmitButton,
    buttonClassName,
    type ButtonVariant,
} from '@/shared/ui';

type SurvivalModeCtaPanelProps = {
    locale: Locale;
    dictionary: Dictionary;
    isAuthenticated: boolean;
    startVariant?: ButtonVariant;
};

const fieldClassName =
    'min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-foreground transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:max-w-xs';

const labelClassName = 'text-sm font-medium text-foreground';

function asSurvivalDifficulty(value: string): SurvivalDifficulty {
    if (value === 'EASY' || value === 'MEDIUM' || value === 'HARD') {
        return value;
    }

    return 'MEDIUM';
}

export function SurvivalModeCtaPanel({
    locale,
    dictionary,
    isAuthenticated,
    startVariant = 'primary',
}: SurvivalModeCtaPanelProps) {
    const labels = dictionary.survivalMode;
    const quizLabels = dictionary.quiz;
    const [state, formAction] = useActionState(startSurvivalQuizAction, {});
    const [difficulty, setDifficulty] =
        useState<SurvivalDifficulty>('MEDIUM');
    const errorMessage = getQuizErrorMessage(dictionary, state.errorCode);

    return (
        <section
            aria-labelledby="survival-mode-heading"
            className="rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-5"
        >
            <p className="font-mono text-[0.65rem] font-medium uppercase tracking-[0.14em] text-muted">
                {labels.eyebrow}
            </p>

            <h2
                id="survival-mode-heading"
                className="mt-1 font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
            >
                {labels.title}
            </h2>

            <p className="mt-2 max-w-prose text-sm leading-snug text-muted">
                {labels.description}
            </p>

            <p className="mt-3 font-mono text-xs tabular-nums text-muted">
                <span className="inline border-l-2 border-primary pl-2">
                    {labels.meta}
                </span>
            </p>

            <div className="mt-4">
                {!isAuthenticated ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                        <p className="text-sm text-muted">{labels.loginPrompt}</p>
                        <PendingLink
                            href={`/${locale}/login`}
                            className={buttonClassName({
                                variant: 'secondary',
                                className: 'sm:w-auto',
                            })}
                        >
                            {labels.loginLink}
                        </PendingLink>
                    </div>
                ) : (
                    <form action={formAction} className="space-y-3">
                        <input type="hidden" name="locale" value={locale} />

                        <label className="flex flex-col gap-2">
                            <span className={labelClassName}>
                                {quizLabels.difficultyLabel}
                            </span>
                            <select
                                name="difficulty"
                                value={difficulty}
                                required
                                className={fieldClassName}
                                onChange={(event) => {
                                    setDifficulty(
                                        asSurvivalDifficulty(
                                            event.target.value,
                                        ),
                                    );
                                }}
                            >
                                <option value="EASY">{quizLabels.easy}</option>
                                <option value="MEDIUM">
                                    {quizLabels.medium}
                                </option>
                                <option value="HARD">{quizLabels.hard}</option>
                            </select>
                        </label>

                        <SubmitButton
                            variant={startVariant}
                            pendingLabel={dictionary.common.working}
                            className="w-full sm:w-auto"
                        >
                            {labels.startButton}
                        </SubmitButton>
                    </form>
                )}
            </div>

            {errorMessage ? (
                <InlineAlert className="mt-3">{errorMessage}</InlineAlert>
            ) : null}
        </section>
    );
}
