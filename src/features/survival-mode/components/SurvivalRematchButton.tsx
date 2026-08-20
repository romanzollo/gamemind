/**
 * Клиентская CTA Survival на result: следующая волна (continue) или rematch.
 *
 * continueRunId → тот же SurvivalRun, T0' с bank, exclude=seen.
 * Без continueRunId → новый SurvivalRun (T0=20, abandon).
 * Action тот же `startSurvivalQuizAction`. Mix нет.
 *
 * Canon: docs/DECISIONS.md → Survival Mode MVP.
 */

'use client';

import { useActionState } from 'react';

import { getQuizErrorMessage } from '@/features/quiz/lib/get-quiz-error-message';
import { startSurvivalQuizAction } from '@/features/survival-mode/actions';
import type { Dictionary, Locale } from '@/shared/i18n';
import { InlineAlert, SubmitButton } from '@/shared/ui';
import type { Difficulty } from '@/types';

type SurvivalRematchButtonProps = {
    locale: Locale;
    difficulty: Difficulty;
    label: string;
    dictionary: Dictionary;
    className?: string;
    /** Если задан — continue того же run, не новый забег. */
    continueRunId?: string;
};

export function SurvivalRematchButton({
    locale,
    difficulty,
    label,
    dictionary,
    className,
    continueRunId,
}: SurvivalRematchButtonProps) {
    const [state, formAction] = useActionState(startSurvivalQuizAction, {});
    const errorMessage = getQuizErrorMessage(dictionary, state.errorCode);

    return (
        <div className={className}>
            <form action={formAction}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="difficulty" value={difficulty} />
                {continueRunId ? (
                    <input
                        type="hidden"
                        name="continueRunId"
                        value={continueRunId}
                    />
                ) : null}
                <SubmitButton
                    pendingLabel={dictionary.common.working}
                    className="w-full sm:w-auto"
                >
                    {label}
                </SubmitButton>
            </form>
            {errorMessage ? (
                <InlineAlert className="mt-2">{errorMessage}</InlineAlert>
            ) : null}
        </div>
    );
}
