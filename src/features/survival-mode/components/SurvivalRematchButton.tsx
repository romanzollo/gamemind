/**
 * Клиентская кнопка «Ещё волна» для Survival.
 *
 * Зачем не Link на /quiz: rematch режима = сразу новая волна
 * с той же difficulty, без повторного выбора режима.
 * Action тот же `startSurvivalQuizAction` (abandon orphan + snapshot).
 * Mix в MVP нет — difficulty только EASY|MEDIUM|HARD.
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
};

export function SurvivalRematchButton({
    locale,
    difficulty,
    label,
    dictionary,
    className,
}: SurvivalRematchButtonProps) {
    const [state, formAction] = useActionState(startSurvivalQuizAction, {});
    const errorMessage = getQuizErrorMessage(dictionary, state.errorCode);

    return (
        <div className={className}>
            <form action={formAction}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="difficulty" value={difficulty} />
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
