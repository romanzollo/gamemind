'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import {
    createQuestionAction,
    updateQuestionAction,
} from '@/features/admin/actions';
import { getAdminErrorMessage } from '@/features/admin/lib';
import type { AdminQuestionDetail } from '@/features/admin/types';
import type { Dictionary, Locale } from '@/shared/i18n';
import type { QuestionType } from '@/types';

const OPTION_COUNT = 4;

const emptyTranslations = () => ({
    ru: { text: '' },
    en: { text: '' },
});

type BaseAdminQuestionFormProps = {
    locale: Locale;
    dictionary: Dictionary;
};

type AdminQuestionFormCreateProps = BaseAdminQuestionFormProps & {
    mode?: 'create';
    initialValues?: never;
};

type AdminQuestionFormEditProps = BaseAdminQuestionFormProps & {
    mode: 'edit';
    initialValues: AdminQuestionDetail;
};

type AdminQuestionFormProps =
    | AdminQuestionFormCreateProps
    | AdminQuestionFormEditProps;

function AdminQuestionSubmitButton({ label }: { label: string }) {
    const { pending } = useFormStatus();

    return (
        <button
            type="submit"
            disabled={pending}
            aria-busy={pending}
            className="rounded bg-neutral-900 px-4 py-2 text-white transition hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:cursor-wait disabled:opacity-70 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300 dark:focus-visible:outline-neutral-100"
        >
            {pending ? `${label}...` : label}
        </button>
    );
}

export function AdminQuestionForm({
    locale,
    dictionary,
    mode = 'create',
    initialValues,
}: AdminQuestionFormProps) {
    const isEdit = mode === 'edit';
    const action = isEdit ? updateQuestionAction : createQuestionAction;
    const [state, formAction] = useActionState(action, {});
    const errorMessage = getAdminErrorMessage(dictionary, state.errorCode);
    const [questionType, setQuestionType] = useState<QuestionType>(
        isEdit ? initialValues!.type : 'TEXT',
    );

    if (isEdit && !initialValues) {
        return null;
    }

    const editValues = isEdit ? initialValues : undefined;

    const options = isEdit
        ? editValues!.options
        : Array.from({ length: OPTION_COUNT }, (_, index) => ({
              id: '',
              translations: emptyTranslations(),
              isCorrect: index === 0,
              order: index,
          }));

    const selectedCorrectIndex = options.findIndex(
        (option) => option.isCorrect,
    );
    const defaultCorrectIndex =
        selectedCorrectIndex >= 0 ? selectedCorrectIndex : 0;

    return (
        <>
            <form action={formAction} className="mt-6 flex flex-col gap-4">
                <input type="hidden" name="locale" value={locale} />
                {isEdit ? (
                    <input
                        type="hidden"
                        name="questionId"
                        value={editValues!.id}
                    />
                ) : null}

                <fieldset className="flex flex-col gap-3">
                    <legend className="font-medium">
                        {dictionary.admin.formQuestionText}
                    </legend>

                    <label className="flex flex-col gap-2">
                        <span>{dictionary.admin.formQuestionTextRu}</span>
                        <textarea
                            name="questionTextRu"
                            required
                            minLength={10}
                            maxLength={500}
                            rows={3}
                            defaultValue={
                                editValues?.translations.ru.text ?? ''
                            }
                            className="rounded border border-border p-3"
                        />
                    </label>

                    <label className="flex flex-col gap-2">
                        <span>{dictionary.admin.formQuestionTextEn}</span>
                        <textarea
                            name="questionTextEn"
                            required
                            minLength={10}
                            maxLength={500}
                            rows={3}
                            defaultValue={
                                editValues?.translations.en.text ?? ''
                            }
                            className="rounded border border-border p-3"
                        />
                    </label>
                </fieldset>

                <label className="flex flex-col gap-2">
                    <span>{dictionary.admin.formQuestionType}</span>
                    <select
                        name="questionType"
                        value={questionType}
                        onChange={(event) => {
                            setQuestionType(
                                event.target.value === 'IMAGE_GUESS'
                                    ? 'IMAGE_GUESS'
                                    : 'TEXT',
                            );
                        }}
                        required
                        className="rounded border border-border p-3"
                    >
                        <option value="TEXT">
                            {dictionary.admin.formQuestionTypeText}
                        </option>
                        <option value="IMAGE_GUESS">
                            {dictionary.admin.formQuestionTypeImageGuess}
                        </option>
                    </select>
                </label>

                {questionType === 'IMAGE_GUESS' ? (
                    <label className="flex flex-col gap-2">
                        <span>{dictionary.admin.formPromptImageUrl}</span>
                        <input
                            type="text"
                            name="promptImageUrl"
                            required
                            maxLength={2048}
                            placeholder="/quiz-images/easy/example.svg"
                            defaultValue={editValues?.promptImageUrl ?? ''}
                            className="rounded border border-border p-3"
                        />
                        <span className="text-sm text-muted">
                            {dictionary.admin.formPromptImageUrlHint}
                        </span>
                    </label>
                ) : (
                    <input type="hidden" name="promptImageUrl" value="" />
                )}

                <label className="flex flex-col gap-2">
                    <span>{dictionary.quiz.difficultyLabel}</span>
                    <select
                        name="difficulty"
                        defaultValue={editValues?.difficulty ?? 'EASY'}
                        required
                        className="rounded border border-border p-3"
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
                        className="rounded border border-border p-3"
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
                            className="flex flex-col gap-2 rounded border border-border p-3"
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

                            <label className="flex flex-col gap-2">
                                <span>{dictionary.admin.formOptionTextRu}</span>
                                <input
                                    type="text"
                                    name={`optionTextRu-${index}`}
                                    required
                                    maxLength={200}
                                    defaultValue={option.translations.ru.text}
                                    className="rounded border border-border p-3"
                                />
                            </label>

                            <label className="flex flex-col gap-2">
                                <span>{dictionary.admin.formOptionTextEn}</span>
                                <input
                                    type="text"
                                    name={`optionTextEn-${index}`}
                                    required
                                    maxLength={200}
                                    defaultValue={option.translations.en.text}
                                    className="rounded border border-border p-3"
                                />
                            </label>
                        </div>
                    ))}
                </fieldset>

                <AdminQuestionSubmitButton
                    label={
                        isEdit
                            ? dictionary.admin.editButton
                            : dictionary.admin.createButton
                    }
                />
            </form>

            {errorMessage ? (
                <p className="mt-2 text-red-600" role="alert">
                    {errorMessage}
                </p>
            ) : null}
        </>
    );
}
