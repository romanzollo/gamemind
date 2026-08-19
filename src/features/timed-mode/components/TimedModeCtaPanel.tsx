/**
 * Клиентская панель Timed Mode (Scoreboard Editorial).
 *
 * Зачем Client: форма start (useActionState) + difficulty select + pending.
 * Auth решает Server parent; гость видит login, не «битую» кнопку.
 * Mix = 4-й option в том же select, не 4-я карточка lobby.
 * Presentation only — scoring / snapshot / submit gate не трогаем.
 */

'use client';

import { useActionState, useId, useState } from 'react';

import { startTimedQuizAction } from '@/features/timed-mode/actions';
import { getQuizErrorMessage } from '@/features/quiz/lib/get-quiz-error-message';
import { getMixedSplitMetaKey } from '@/features/quiz/lib/mixed-difficulty-split';
import { TIMED_MODE_MVP_RULES } from '@/features/timed-mode/types';
import type { Dictionary, Locale } from '@/shared/i18n';
import {
    InlineAlert,
    PendingLink,
    SubmitButton,
    buttonClassName,
    type ButtonVariant,
} from '@/shared/ui';
import type { QuizSetupDifficulty } from '@/types';

type TimedModeCtaPanelProps = {
    locale: Locale;
    dictionary: Dictionary;
    isAuthenticated: boolean;
    startVariant?: ButtonVariant;
};

const fieldClassName =
    'min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-foreground transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:max-w-xs';

const labelClassName = 'text-sm font-medium text-foreground';

function asSetupDifficulty(value: string): QuizSetupDifficulty {
    if (
        value === 'EASY' ||
        value === 'MEDIUM' ||
        value === 'HARD' ||
        value === 'MIXED'
    ) {
        return value;
    }

    return 'MEDIUM';
}

export function TimedModeCtaPanel({
    locale,
    dictionary,
    isAuthenticated,
    startVariant = 'primary',
}: TimedModeCtaPanelProps) {
    const labels = dictionary.timedMode;
    const quizLabels = dictionary.quiz;
    const [state, formAction] = useActionState(startTimedQuizAction, {});
    const [difficulty, setDifficulty] =
        useState<QuizSetupDifficulty>('MEDIUM');
    const mixedMetaId = useId();
    const errorMessage = getQuizErrorMessage(dictionary, state.errorCode);
    const mixedMetaKey =
        difficulty === 'MIXED'
            ? getMixedSplitMetaKey(TIMED_MODE_MVP_RULES.questionCount)
            : null;
    const mixedMetaText = mixedMetaKey ? quizLabels[mixedMetaKey] : null;

    return (
        <section
            aria-labelledby="timed-mode-heading"
            className="rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-5"
        >
            <p className="font-mono text-[0.65rem] font-medium uppercase tracking-[0.14em] text-muted">
                {labels.eyebrow}
            </p>

            <h2
                id="timed-mode-heading"
                className="mt-1 font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
            >
                {labels.title}
            </h2>

            <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
                {labels.description}
            </p>

            <p className="mt-3 font-mono text-xs tabular-nums text-muted">
                <span className="border-l-2 border-primary pl-2">
                    {labels.meta}
                </span>
            </p>

            <p className="mt-2 max-w-prose text-xs leading-relaxed text-muted">
                {labels.leaderboardHint}
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
                                aria-describedby={
                                    mixedMetaText ? mixedMetaId : undefined
                                }
                                className={fieldClassName}
                                onChange={(event) => {
                                    setDifficulty(
                                        asSetupDifficulty(event.target.value),
                                    );
                                }}
                            >
                                <option value="EASY">{quizLabels.easy}</option>
                                <option value="MEDIUM">
                                    {quizLabels.medium}
                                </option>
                                <option value="HARD">{quizLabels.hard}</option>
                                <option value="MIXED">{quizLabels.mixed}</option>
                            </select>
                        </label>

                        {mixedMetaText ? (
                            <p
                                id={mixedMetaId}
                                className="font-mono text-xs tabular-nums text-muted"
                            >
                                <span className="border-l-2 border-primary pl-2">
                                    {mixedMetaText}
                                </span>
                            </p>
                        ) : null}

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
