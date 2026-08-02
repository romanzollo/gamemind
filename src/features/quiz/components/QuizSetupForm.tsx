'use client';

import { useActionState } from 'react';

import { startQuizAction } from '@/features/quiz/actions';
import { getQuizErrorMessage } from '@/features/quiz/lib/get-quiz-error-message';
import type { Dictionary, Locale } from '@/shared/i18n';
import { InlineAlert, SubmitButton } from '@/shared/ui';

type QuizSetupFormProps = {
    locale: Locale;
    dictionary: Dictionary;
};

const fieldClassName =
    'min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-foreground transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

const labelClassName = 'text-sm font-medium text-foreground sm:text-base';

/**
 * Classic на mode lobby — тот же card-паттерн, что TimedModeCtaPanel
 * (eyebrow / title / description / meta + form). Start CTA = primary (как Blitz).
 */
export function QuizSetupForm({ locale, dictionary }: QuizSetupFormProps) {
    const [state, formAction] = useActionState(startQuizAction, {});
    const errorMessage = getQuizErrorMessage(dictionary, state.errorCode);
    const labels = dictionary.quiz;

    return (
        <section
            aria-labelledby="classic-mode-heading"
            className="mt-4 rounded-lg border border-border bg-surface p-4 shadow-sm sm:mt-5 sm:p-5"
        >
            <p className="font-mono text-[0.65rem] font-medium uppercase tracking-[0.14em] text-muted">
                {labels.classicEyebrow}
            </p>

            <h2
                id="classic-mode-heading"
                className="mt-1 font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
            >
                {labels.classicTitle}
            </h2>

            <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
                {labels.classicDescription}
            </p>

            <p className="mt-3 font-mono text-xs tabular-nums text-muted">
                <span className="border-l-2 border-primary pl-2">
                    {labels.classicMeta}
                </span>
            </p>

            <form action={formAction} className="mt-4 space-y-4">
                <input type="hidden" name="locale" value={locale} />

                <label className="flex flex-col gap-2">
                    <span className={labelClassName}>
                        {labels.difficultyLabel}
                    </span>
                    <select
                        name="difficulty"
                        defaultValue="EASY"
                        required
                        className={fieldClassName}
                    >
                        <option value="EASY">{labels.easy}</option>
                        <option value="MEDIUM">{labels.medium}</option>
                        <option value="HARD">{labels.hard}</option>
                    </select>
                </label>

                <label className="flex flex-col gap-2">
                    <span className={labelClassName}>
                        {labels.questionCountLabel}
                    </span>
                    <select
                        name="questionCount"
                        defaultValue="3"
                        required
                        className={fieldClassName}
                    >
                        <option value="3">3</option>
                        <option value="5">5</option>
                        <option value="10">10</option>
                    </select>
                </label>

                <SubmitButton
                    pendingLabel={dictionary.common.working}
                    className="w-full"
                >
                    {labels.startButton}
                </SubmitButton>
            </form>

            {errorMessage ? (
                <InlineAlert className="mt-3">{errorMessage}</InlineAlert>
            ) : null}
        </section>
    );
}
