'use client';

import { useActionState } from 'react';

import { createQuestionAction } from '@/features/admin/actions';
import { getAdminErrorMessage } from '@/features/admin/lib';
import type { Dictionary, Locale } from '@/shared/i18n';

// количество вариантов ответа
const OPTION_COUNT = 4;

// тип пропсов компонента формы создания вопроса
type AdminQuestionFormProps = {
    locale: Locale;
    dictionary: Dictionary;
};

// компонент формы создания вопроса
export function AdminQuestionForm({
    locale,
    dictionary,
}: AdminQuestionFormProps) {
    // получаем состояние формы и действие формы
    const [state, formAction] = useActionState(createQuestionAction, {});
    // получаем сообщение об ошибке
    const errorMessage = getAdminErrorMessage(dictionary, state.errorCode);

    return (
        <>
            <form action={formAction} className="mt-6 flex flex-col gap-4">
                <input type="hidden" name="locale" value={locale} />

                <label className="flex flex-col gap-2">
                    <span>{dictionary.admin.formQuestionText}</span>
                    <textarea
                        name="text"
                        required
                        minLength={10}
                        maxLength={500}
                        rows={3}
                        className="rounded border border-(--border) p-3"
                    />
                </label>

                <label className="flex flex-col gap-2">
                    <span>{dictionary.quiz.difficultyLabel}</span>
                    <select
                        name="difficulty"
                        defaultValue="EASY"
                        required
                        className="rounded border border-(--border) p-3"
                    >
                        <option value="EASY">{dictionary.quiz.easy}</option>
                        <option value="MEDIUM">{dictionary.quiz.medium}</option>
                        <option value="HARD">{dictionary.quiz.hard}</option>
                    </select>
                </label>

                <label className="flex flex-col gap-2">
                    <span>{dictionary.admin.formCategory}</span>
                    <input
                        type="text"
                        name="category"
                        defaultValue="video-games"
                        required
                        maxLength={100}
                        className="rounded border border-(--border) p-3"
                    />
                </label>

                <fieldset className="flex flex-col gap-3">
                    <legend className="font-medium">
                        {dictionary.admin.formOptions}
                    </legend>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        {dictionary.admin.formCorrectOptionHint}
                    </p>

                    {Array.from({ length: OPTION_COUNT }, (_, index) => (
                        <div
                            key={index}
                            className="flex flex-col gap-2 rounded border border-(--border) p-3"
                        >
                            <label className="flex items-center gap-2">
                                <input
                                    type="radio"
                                    name="correctOptionIndex"
                                    value={index}
                                    defaultChecked={index === 0}
                                    required
                                />
                                <span>
                                    {dictionary.admin.formOption} {index + 1}
                                </span>
                            </label>
                            <input
                                type="text"
                                name={`optionText-${index}`}
                                required
                                maxLength={200}
                                className="rounded border border-(--border) p-3"
                            />
                        </div>
                    ))}
                </fieldset>

                <button
                    type="submit"
                    className="rounded bg-neutral-900 px-4 py-2 text-white transition hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300 dark:focus-visible:outline-neutral-100"
                >
                    {dictionary.admin.createButton}
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
