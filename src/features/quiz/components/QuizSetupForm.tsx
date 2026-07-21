'use client';

import { useActionState } from 'react';

import { startQuizAction } from '@/features/quiz/actions';
import { getQuizErrorMessage } from '@/features/quiz/lib/get-quiz-error-message';
import type { Dictionary, Locale } from '@/shared/i18n';
import { SubmitButton } from '@/shared/ui';

// тип для пропсов компонента QuizSetupForm
type QuizSetupFormProps = {
    locale: Locale;
    dictionary: Dictionary;
};

// классы для стилей полей формы
const fieldClassName =
    'min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-foreground transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

// классы для стилей лейблов формы
const labelClassName = 'text-sm font-medium text-foreground sm:text-base';

// компонент формы настройки викторины
export function QuizSetupForm({ locale, dictionary }: QuizSetupFormProps) {
    const [state, formAction] = useActionState(startQuizAction, {});
    const errorMessage = getQuizErrorMessage(dictionary, state.errorCode);

    return (
        <>
            <form
                action={formAction}
                className="mt-6 space-y-4 rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-5"
            >
                <input type="hidden" name="locale" value={locale} />

                <label className="flex flex-col gap-2">
                    <span className={labelClassName}>
                        {dictionary.quiz.difficultyLabel}
                    </span>
                    <select
                        name="difficulty"
                        defaultValue="EASY"
                        required
                        className={fieldClassName}
                    >
                        <option value="EASY">{dictionary.quiz.easy}</option>
                        <option value="MEDIUM">{dictionary.quiz.medium}</option>
                        <option value="HARD">{dictionary.quiz.hard}</option>
                    </select>
                </label>

                <label className="flex flex-col gap-2">
                    <span className={labelClassName}>
                        {dictionary.quiz.questionCountLabel}
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
                    className="w-full sm:w-auto"
                >
                    {dictionary.quiz.startButton}
                </SubmitButton>
            </form>

            {errorMessage && (
                <p
                    className="mt-2 rounded-sm bg-danger-muted px-3 py-2 text-sm text-danger"
                    role="alert"
                >
                    {errorMessage}
                </p>
            )}
        </>
    );
}
