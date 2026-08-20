'use client';

import { useActionState, useId, useState } from 'react';

import { startQuizAction } from '@/features/quiz/actions';
import { getQuizErrorMessage } from '@/features/quiz/lib/get-quiz-error-message';
import { getMixedSplitMetaKey } from '@/features/quiz/lib/mixed-difficulty-split';
import type { Dictionary, Locale } from '@/shared/i18n';
import { InlineAlert, SubmitButton } from '@/shared/ui';
import type { QuizSetupDifficulty } from '@/types';

type QuizSetupFormProps = {
    locale: Locale;
    dictionary: Dictionary;
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

    return 'EASY';
}

function asClassicQuestionCount(value: string): 3 | 5 | 10 {
    if (value === '5') {
        return 5;
    }

    if (value === '10') {
        return 10;
    }

    return 3;
}

/**
 * Classic на mode lobby — тот же card-паттерн, что TimedModeCtaPanel
 * (eyebrow / title / description / meta + form). Start CTA = primary (как Blitz).
 * Mix = 4-й option select, не 4-я карточка. Сплит — meta под полями, не segmented.
 */
export function QuizSetupForm({ locale, dictionary }: QuizSetupFormProps) {
    const [state, formAction] = useActionState(startQuizAction, {});
    const [difficulty, setDifficulty] = useState<QuizSetupDifficulty>('EASY');
    const [questionCount, setQuestionCount] = useState<3 | 5 | 10>(3);
    const mixedMetaId = useId();
    const errorMessage = getQuizErrorMessage(dictionary, state.errorCode);
    const labels = dictionary.quiz;
    const mixedMetaKey =
        difficulty === 'MIXED' ? getMixedSplitMetaKey(questionCount) : null;
    const mixedMetaText = mixedMetaKey ? labels[mixedMetaKey] : null;

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

            <p className="mt-2 max-w-prose text-sm leading-snug text-muted">
                {labels.classicDescription}
            </p>

            <p className="mt-3 font-mono text-xs tabular-nums text-muted">
                <span className="inline border-l-2 border-primary pl-2">
                    {labels.classicMeta}
                </span>
            </p>

            <p className="mt-2 hidden max-w-prose text-xs leading-snug text-muted sm:block">
                {labels.classicLeaderboardHint}
            </p>

            <form action={formAction} className="mt-4 space-y-4">
                <input type="hidden" name="locale" value={locale} />

                <label className="flex flex-col gap-2">
                    <span className={labelClassName}>
                        {labels.difficultyLabel}
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
                        <option value="EASY">{labels.easy}</option>
                        <option value="MEDIUM">{labels.medium}</option>
                        <option value="HARD">{labels.hard}</option>
                        <option value="MIXED">{labels.mixed}</option>
                    </select>
                </label>

                <label className="flex flex-col gap-2">
                    <span className={labelClassName}>
                        {labels.questionCountLabel}
                    </span>
                    <select
                        name="questionCount"
                        value={String(questionCount)}
                        required
                        className={fieldClassName}
                        onChange={(event) => {
                            setQuestionCount(
                                asClassicQuestionCount(event.target.value),
                            );
                        }}
                    >
                        <option value="3">3</option>
                        <option value="5">5</option>
                        <option value="10">10</option>
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
                    pendingLabel={dictionary.common.working}
                    className="w-full sm:w-auto"
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
