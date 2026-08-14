/**
 * Клиентская кнопка «Пройти ещё раз» для Classic.
 *
 * Тот же принцип, что TimedRematchButton:
 * отдельный Server Action → сразу новая партия с теми же правилами.
 */

'use client';

import { useActionState } from 'react';

import { rematchClassicQuizAction } from '@/features/quiz/actions/rematch-classic-quiz';
import { getQuizErrorMessage } from '@/features/quiz/lib/get-quiz-error-message';
import type { Dictionary, Locale } from '@/shared/i18n';
import { InlineAlert, SubmitButton } from '@/shared/ui';
import type { QuizSetupDifficulty } from '@/types';

type ClassicRematchButtonProps = {
    locale: Locale;
    difficulty: QuizSetupDifficulty;
    questionCount: number;
    label: string;
    dictionary: Dictionary;
    className?: string;
};

export function ClassicRematchButton({
    locale,
    difficulty,
    questionCount,
    label,
    dictionary,
    className,
}: ClassicRematchButtonProps) {
    const [state, formAction] = useActionState(rematchClassicQuizAction, {});
    const errorMessage = getQuizErrorMessage(dictionary, state.errorCode);

    return (
        <div className={className}>
            <form action={formAction}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="difficulty" value={difficulty} />
                <input
                    type="hidden"
                    name="questionCount"
                    value={String(questionCount)}
                />
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
