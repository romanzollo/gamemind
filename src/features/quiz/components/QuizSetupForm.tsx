'use client';

import { useActionState } from 'react';

import { startQuizAction } from '@/features/quiz/actions';
import { getQuizErrorMessage } from '@/features/quiz/lib/get-quiz-error-message';
import type { Dictionary, Locale } from '@/shared/i18n';

type QuizSetupFormProps = {
    locale: Locale;
    dictionary: Dictionary;
};

// компонент для формы настройки викторины
export function QuizSetupForm({ locale, dictionary }: QuizSetupFormProps) {
    const [state, formAction] = useActionState(startQuizAction, {});
    const errorMessage = getQuizErrorMessage(dictionary, state.errorCode);

    return (
        <>
            <form action={formAction} className="mt-6 flex flex-col gap-4">
                <input type="hidden" name="locale" value={locale} />

                <label className="flex flex-col gap-2">
                    <span>{dictionary.quiz.difficultyLabel}</span>
                    <select name="difficulty" defaultValue="EASY" required>
                        <option value="EASY">{dictionary.quiz.easy}</option>
                        <option value="MEDIUM">{dictionary.quiz.medium}</option>
                        <option value="HARD">{dictionary.quiz.hard}</option>
                    </select>
                </label>

                <label className="flex flex-col gap-2">
                    <span>{dictionary.quiz.questionCountLabel}</span>
                    <select name="questionCount" defaultValue="3" required>
                        <option value="3">3</option>
                        {/* <option value="5">5</option>
                        <option value="10">10</option> */}
                    </select>
                </label>

                <button
                    type="submit"
                    className="rounded bg-neutral-900 px-4 py-2 text-white transition hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300 dark:focus-visible:outline-neutral-100"
                >
                    {dictionary.quiz.startButton}
                </button>
            </form>

            {errorMessage && (
                <p className="mt-2 text-red-600" role="alert">
                    {errorMessage}
                </p>
            )}
        </>
    );
}
