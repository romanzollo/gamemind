/**
 * Клиентская кнопка «Реванш» для Timed.
 *
 * Зачем не Link на /quiz: в проде rematch режима = сразу новая партия
 * с теми же правилами (сложность), без повторного выбора режима.
 * Action тот же `startTimedQuizAction` (abandon orphan + snapshot).
 */

'use client';

import { useActionState } from 'react';

import { startTimedQuizAction } from '@/features/timed-mode/actions';
import { getQuizErrorMessage } from '@/features/quiz/lib/get-quiz-error-message';
import type { Dictionary, Locale } from '@/shared/i18n';
import { InlineAlert, SubmitButton } from '@/shared/ui';
import type { Difficulty } from '@/types';

type TimedRematchButtonProps = {
    locale: Locale;
    difficulty: Difficulty;
    label: string;
    dictionary: Dictionary;
    className?: string;
};

export function TimedRematchButton({
    locale,
    difficulty,
    label,
    dictionary,
    className,
}: TimedRematchButtonProps) {
    const [state, formAction] = useActionState(startTimedQuizAction, {});
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
