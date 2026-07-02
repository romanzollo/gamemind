'use client';

import { useActionState } from 'react';

import {
    createQuestionAction,
    updateQuestionAction,
} from '@/features/admin/actions';
import { getAdminErrorMessage } from '@/features/admin/lib';
import type { AdminQuestionDetail } from '@/features/admin/types';
import type { Dictionary, Locale } from '@/shared/i18n';

// количество вариантов ответа
const OPTION_COUNT = 4;

// тип пропсов компонента формы вопроса для администрирования
type BaseAdminQuestionFormProps = {
    locale: Locale;
    dictionary: Dictionary;
};

// тип пропсов компонента формы вопроса для создания вопроса
type AdminQuestionFormCreateProps = BaseAdminQuestionFormProps & {
    mode?: 'create';
    initialValues?: never;
};

// тип пропсов компонента формы вопроса для редактирования вопроса
type AdminQuestionFormEditProps = BaseAdminQuestionFormProps & {
    mode: 'edit';
    initialValues: AdminQuestionDetail;
};

// тип пропсов компонента формы вопроса для администрирования
type AdminQuestionFormProps =
    | AdminQuestionFormCreateProps
    | AdminQuestionFormEditProps;

// компонент формы вопроса для администрирования
export function AdminQuestionForm({
    locale,
    dictionary,
    mode = 'create',
    initialValues,
}: AdminQuestionFormProps) {
    const isEdit = mode === 'edit';

    if (isEdit && !initialValues) {
        return null;
    }
    // получаем значения для редактирования вопроса
    const editValues = isEdit ? initialValues : undefined;

    // выбираем действие в зависимости от режима
    const action = isEdit ? updateQuestionAction : createQuestionAction;
    const [state, formAction] = useActionState(action, {});
    const errorMessage = getAdminErrorMessage(dictionary, state.errorCode);

    // получаем варианты ответа в зависимости от режима
    const options = isEdit
        ? editValues!.options
        : Array.from({ length: OPTION_COUNT }, (_, index) => ({
              id: '',
              text: '',
              isCorrect: index === 0,
              order: index,
          }));

    // получаем индекс правильного варианта ответа
    const selectedCorrectIndex = options.findIndex(
        (option) => option.isCorrect,
    );
    // получаем индекс правильного варианта ответа по умолчанию
    const defaultCorrectIndex =
        selectedCorrectIndex >= 0 ? selectedCorrectIndex : 0;

    return (
        <>
            <form action={formAction} className="mt-6 flex flex-col gap-4">
                {/* добавляем скрытое поле для локали */}
                <input type="hidden" name="locale" value={locale} />
                {/* добавляем скрытое поле для id вопроса в режиме редактирования */}
                {isEdit ? (
                    <input
                        type="hidden"
                        name="questionId"
                        value={editValues!.id}
                    />
                ) : null}

                <label className="flex flex-col gap-2">
                    <span>{dictionary.admin.formQuestionText}</span>
                    <textarea
                        name="text"
                        required
                        minLength={10}
                        maxLength={500}
                        rows={3}
                        defaultValue={editValues?.text ?? ''}
                        className="rounded border border-(--border) p-3"
                    />
                </label>

                <label className="flex flex-col gap-2">
                    <span>{dictionary.quiz.difficultyLabel}</span>
                    <select
                        name="difficulty"
                        defaultValue={editValues?.difficulty ?? 'EASY'}
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
                        defaultValue={editValues?.category ?? 'video-games'}
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

                    {options.map((option, index) => (
                        <div
                            key={option.id || index}
                            className="flex flex-col gap-2 rounded border border-(--border) p-3"
                        >
                            {isEdit ? (
                                <input
                                    type="hidden"
                                    name={`optionId-${index}`}
                                    value={option.id}
                                />
                            ) : null}

                            <label className="flex items-center gap-2">
                                <input
                                    type="radio"
                                    name="correctOptionIndex"
                                    value={index}
                                    defaultChecked={
                                        index === defaultCorrectIndex
                                    }
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
                                defaultValue={option.text}
                                className="rounded border border-(--border) p-3"
                            />
                        </div>
                    ))}
                </fieldset>

                <button
                    type="submit"
                    className="rounded bg-neutral-900 px-4 py-2 text-white transition hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300 dark:focus-visible:outline-neutral-100"
                >
                    {isEdit
                        ? dictionary.admin.editButton
                        : dictionary.admin.createButton}
                </button>
            </form>

            {errorMessage ? (
                <p className="mt-2 text-red-600" role="alert">
                    {errorMessage}
                </p>
            ) : null}
        </>
    );
}
