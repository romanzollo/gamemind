'use client';

/**
 * Форма create/edit вопроса.
 *
 * Поля — controlled (useState): после Server Action React 19 сбрасывает
 * uncontrolled inputs в форме; иначе при INVALID_INPUT (например IMAGE_GUESS
 * без картинки) админ теряет весь ввод. File input восстановить нельзя
 * (ограничение браузера) — его оставляем uncontrolled.
 */

import { useActionState, useState } from 'react';

import {
    createQuestionAction,
    updateQuestionAction,
} from '@/features/admin/actions/questions';
import { getAdminErrorMessage } from '@/features/admin/lib';
import type { AdminQuestionDetail } from '@/features/admin/types';
import type { Dictionary, Locale } from '@/shared/i18n';
import { InlineAlert, SubmitButton } from '@/shared/ui';
import type { Difficulty, QuestionType } from '@/types';

const OPTION_COUNT = 4;
const IMAGE_GUESS_DEFAULT_TEXT = {
    ru: 'Угадай игру по изображению.',
    en: 'Guess the game from the image.',
};

/** Общий стиль полей — Scoreboard tokens + focus ring (как на Profile). */
const fieldClassName =
    'min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-foreground motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

type OptionDraft = {
    id: string;
    textRu: string;
    textEn: string;
};

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

function buildInitialOptions(
    isEdit: boolean,
    initialValues?: AdminQuestionDetail,
): OptionDraft[] {
    if (isEdit && initialValues) {
        return initialValues.options.map((option) => ({
            id: option.id,
            textRu: option.translations.ru.text,
            textEn: option.translations.en.text,
        }));
    }

    return Array.from({ length: OPTION_COUNT }, () => ({
        id: '',
        textRu: '',
        textEn: '',
    }));
}

function AdminQuestionSubmitButton({
    label,
    pendingLabel,
}: {
    label: string;
    pendingLabel: string;
}) {
    return (
        <SubmitButton pendingLabel={pendingLabel}>{label}</SubmitButton>
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

    const [questionTextRu, setQuestionTextRu] = useState(
        isEdit ? initialValues!.translations.ru.text : '',
    );
    const [questionTextEn, setQuestionTextEn] = useState(
        isEdit ? initialValues!.translations.en.text : '',
    );
    const [questionType, setQuestionType] = useState<QuestionType>(
        isEdit ? initialValues!.type : 'TEXT',
    );
    const [promptImageUrl, setPromptImageUrl] = useState(
        isEdit ? (initialValues!.promptImageUrl ?? '') : '',
    );
    const [difficulty, setDifficulty] = useState<Difficulty>(
        isEdit ? initialValues!.difficulty : 'EASY',
    );
    const [category, setCategory] = useState(
        isEdit ? initialValues!.category : 'video-games',
    );
    const [options, setOptions] = useState<OptionDraft[]>(() =>
        buildInitialOptions(isEdit, initialValues),
    );
    const [correctOptionIndex, setCorrectOptionIndex] = useState(() => {
        if (!isEdit || !initialValues) {
            return 0;
        }
        const index = initialValues.options.findIndex(
            (option) => option.isCorrect,
        );
        return index >= 0 ? index : 0;
    });

    if (isEdit && !initialValues) {
        return null;
    }

    const editValues = isEdit ? initialValues : undefined;

    function updateOptionText(
        index: number,
        field: 'textRu' | 'textEn',
        value: string,
    ) {
        setOptions((current) =>
            current.map((option, optionIndex) =>
                optionIndex === index
                    ? { ...option, [field]: value }
                    : option,
            ),
        );
    }

    return (
        <>
            <form
                action={formAction}
                className="mt-6 flex flex-col gap-4"
            >
                <input type="hidden" name="locale" value={locale} />
                {isEdit ? (
                    <input
                        type="hidden"
                        name="questionId"
                        value={editValues!.id}
                    />
                ) : null}

                <fieldset className="flex flex-col gap-3">
                    <legend className="font-medium text-foreground">
                        {dictionary.admin.formQuestionText}
                    </legend>

                    <label className="flex flex-col gap-2 text-sm text-foreground">
                        <span>{dictionary.admin.formQuestionTextRu}</span>
                        <textarea
                            name="questionTextRu"
                            required
                            minLength={10}
                            maxLength={500}
                            rows={3}
                            value={questionTextRu}
                            onChange={(event) => {
                                setQuestionTextRu(event.target.value);
                            }}
                            className={fieldClassName}
                        />
                    </label>

                    <label className="flex flex-col gap-2 text-sm text-foreground">
                        <span>{dictionary.admin.formQuestionTextEn}</span>
                        <textarea
                            name="questionTextEn"
                            required
                            minLength={10}
                            maxLength={500}
                            rows={3}
                            value={questionTextEn}
                            onChange={(event) => {
                                setQuestionTextEn(event.target.value);
                            }}
                            className={fieldClassName}
                        />
                    </label>
                </fieldset>

                <label className="flex flex-col gap-2 text-sm text-foreground">
                    <span>{dictionary.admin.formQuestionType}</span>
                    <select
                        name="questionType"
                        value={questionType}
                        onChange={(event) => {
                            const nextType =
                                event.target.value === 'IMAGE_GUESS'
                                    ? 'IMAGE_GUESS'
                                    : 'TEXT';

                            setQuestionType(nextType);

                            if (nextType === 'IMAGE_GUESS' && !isEdit) {
                                setQuestionTextRu((current) =>
                                    current.trim()
                                        ? current
                                        : IMAGE_GUESS_DEFAULT_TEXT.ru,
                                );
                                setQuestionTextEn((current) =>
                                    current.trim()
                                        ? current
                                        : IMAGE_GUESS_DEFAULT_TEXT.en,
                                );
                            }
                        }}
                        required
                        className={fieldClassName}
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
                    <fieldset className="flex flex-col gap-3">
                        <legend className="font-medium text-foreground">
                            {dictionary.admin.formPromptImage}
                        </legend>

                        <label className="flex flex-col gap-2 text-sm text-foreground">
                            <span>{dictionary.admin.formPromptImageFile}</span>
                            <input
                                type="file"
                                name="promptImageFile"
                                accept="image/jpeg,image/png,image/webp"
                                className={fieldClassName}
                            />
                            <span className="text-sm text-muted">
                                {dictionary.admin.formPromptImageFileHint}
                            </span>
                        </label>

                        {editValues?.promptImageUrl ? (
                            <>
                                <input
                                    type="hidden"
                                    name="previousPromptImageUrl"
                                    value={editValues.promptImageUrl}
                                />
                                <p className="text-sm text-muted">
                                    {dictionary.admin.formPromptImageCurrent}:{' '}
                                    <span className="break-all text-foreground">
                                        {editValues.promptImageUrl}
                                    </span>
                                </p>
                            </>
                        ) : null}

                        <label className="flex flex-col gap-2 text-sm text-foreground">
                            <span>{dictionary.admin.formPromptImageUrl}</span>
                            <input
                                type="text"
                                name="promptImageUrl"
                                maxLength={2048}
                                placeholder="/quiz-images/easy/example.webp"
                                value={promptImageUrl}
                                onChange={(event) => {
                                    setPromptImageUrl(event.target.value);
                                }}
                                className={fieldClassName}
                            />
                            <span className="text-sm text-muted">
                                {dictionary.admin.formPromptImageUrlHint}
                            </span>
                        </label>
                    </fieldset>
                ) : (
                    <input type="hidden" name="promptImageUrl" value="" />
                )}

                <label className="flex flex-col gap-2 text-sm text-foreground">
                    <span>{dictionary.quiz.difficultyLabel}</span>
                    <select
                        name="difficulty"
                        value={difficulty}
                        onChange={(event) => {
                            const value = event.target.value;
                            if (
                                value === 'EASY' ||
                                value === 'MEDIUM' ||
                                value === 'HARD'
                            ) {
                                setDifficulty(value);
                            }
                        }}
                        required
                        className={fieldClassName}
                    >
                        <option value="EASY">{dictionary.quiz.easy}</option>
                        <option value="MEDIUM">{dictionary.quiz.medium}</option>
                        <option value="HARD">{dictionary.quiz.hard}</option>
                    </select>
                </label>

                <label className="flex flex-col gap-2 text-sm text-foreground">
                    <span>{dictionary.admin.formCategory}</span>
                    <input
                        type="text"
                        name="category"
                        value={category}
                        onChange={(event) => {
                            setCategory(event.target.value);
                        }}
                        required
                        maxLength={100}
                        className={fieldClassName}
                    />
                </label>

                <fieldset className="flex flex-col gap-3">
                    <legend className="font-medium text-foreground">
                        {dictionary.admin.formOptions}
                    </legend>
                    <p className="text-sm text-muted">
                        {dictionary.admin.formCorrectOptionHint}
                    </p>

                    {options.map((option, index) => (
                        <div
                            key={option.id || `option-${index}`}
                            className="flex flex-col gap-2 rounded-md border border-border bg-surface-muted/40 p-3"
                        >
                            {isEdit ? (
                                <input
                                    type="hidden"
                                    name={`optionId-${index}`}
                                    value={option.id}
                                />
                            ) : null}

                            <label className="flex items-center gap-2 text-sm text-foreground">
                                <input
                                    type="radio"
                                    name="correctOptionIndex"
                                    value={index}
                                    checked={index === correctOptionIndex}
                                    onChange={() => {
                                        setCorrectOptionIndex(index);
                                    }}
                                    required
                                    className="accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                                />
                                <span>
                                    {dictionary.admin.formOption} {index + 1}
                                </span>
                            </label>

                            <label className="flex flex-col gap-2 text-sm text-foreground">
                                <span>{dictionary.admin.formOptionTextRu}</span>
                                <input
                                    type="text"
                                    name={`optionTextRu-${index}`}
                                    required
                                    maxLength={200}
                                    value={option.textRu}
                                    onChange={(event) => {
                                        updateOptionText(
                                            index,
                                            'textRu',
                                            event.target.value,
                                        );
                                    }}
                                    className={fieldClassName}
                                />
                            </label>

                            <label className="flex flex-col gap-2 text-sm text-foreground">
                                <span>{dictionary.admin.formOptionTextEn}</span>
                                <input
                                    type="text"
                                    name={`optionTextEn-${index}`}
                                    required
                                    maxLength={200}
                                    value={option.textEn}
                                    onChange={(event) => {
                                        updateOptionText(
                                            index,
                                            'textEn',
                                            event.target.value,
                                        );
                                    }}
                                    className={fieldClassName}
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
                    pendingLabel={dictionary.common.submitting}
                />
            </form>

            {errorMessage ? (
                <InlineAlert className="mt-2">{errorMessage}</InlineAlert>
            ) : null}
        </>
    );
}
