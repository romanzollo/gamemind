'use client';

/**
 * Форма create/edit вопроса.
 *
 * Поля — controlled (useState): после Server Action React 19 сбрасывает
 * uncontrolled inputs в форме; иначе при INVALID_INPUT (например IMAGE_GUESS
 * без картинки) админ теряет весь ввод. File input восстановить нельзя
 * (ограничение браузера) — его оставляем uncontrolled.
 *
 * Bilingual: для каждого варианта заполнять RU и EN согласованно
 * (не локализовать только правильный ответ). Canon: docs/QUESTION_I18N.md.
 * RU и EN стоят рядом (sm+), чтобы расхождение переводов было видно сразу.
 *
 * IMAGE_GUESS: превью нового файла (blob: URL) или текущего/введённого URL —
 * админ видит кадр до сохранения, а не только путь.
 *
 * AUDIO_GUESS: готовый MP3 (проверяет и чистит сервер), плеер для
 * прослушки нового или текущего клипа и подпись трека. Текущий клип уходит
 * скрытым полем `promptAudioUrl` — сервер принимает только наш
 * `/media/audio/{hash}.mp3`. ADR: docs/DECISIONS.md → AUDIO_GUESS → Admin.
 */

import { useActionState, useEffect, useState } from 'react';

import {
    createQuestionAction,
    updateQuestionAction,
} from '@/features/admin/actions/questions';
import {
    ADMIN_QUESTION_LIST_BACK_PARAM,
    getAdminErrorMessage,
} from '@/features/admin/lib';
import type { AdminQuestionDetail } from '@/features/admin/types';
import { isQuizAudioPublicUrl } from '@/lib/storage/quiz-audio-url';
import type { Dictionary, Locale } from '@/shared/i18n';
import { InlineAlert, SubmitButton } from '@/shared/ui';
import type { Difficulty, QuestionType } from '@/types';

const OPTION_COUNT = 4;
const IMAGE_GUESS_DEFAULT_TEXT = {
    ru: 'Угадай игру по изображению.',
    en: 'Guess the game from the image.',
};
/** Как у партий конвейера клипов (CONTENT_PIPELINE §11). */
const AUDIO_GUESS_DEFAULT_TEXT = {
    ru: 'Из какой игры эта музыка?',
    en: 'Which game is this music from?',
};

const QUESTION_TYPES: readonly QuestionType[] = [
    'TEXT',
    'IMAGE_GUESS',
    'AUDIO_GUESS',
];

function toQuestionType(value: string): QuestionType {
    return QUESTION_TYPES.find((type) => type === value) ?? 'TEXT';
}

/** Общий стиль полей — Scoreboard tokens + focus ring (как на Profile). */
const fieldClassName =
    'min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-foreground motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/** Пара RU | EN: колонками от sm, стопкой на телефоне. */
const bilingualGridClassName = 'grid gap-3 sm:grid-cols-2';

/**
 * URL для превью: same-origin путь или https (как allowlist server-валидации).
 * `//host` отсекаем — protocol-relative ушёл бы на чужой домен.
 */
function getPreviewableImageUrl(value: string): string | null {
    const trimmed = value.trim();

    if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
        return trimmed;
    }

    return trimmed.startsWith('https://') ? trimmed : null;
}

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
    listBack?: never;
};

type AdminQuestionFormEditProps = BaseAdminQuestionFormProps & {
    mode: 'edit';
    initialValues: AdminQuestionDetail;
    /** Query списка: после «Сохранить» возвращаемся на ту же страницу списка. */
    listBack: string;
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

/** До lg: отступ под закреплённую кнопку (py-3 + min-h-11 + border ≈ 4.5rem). */
const ADMIN_FORM_FIXED_SAVE_SPACE = 'pb-20 lg:pb-0';

function AdminQuestionSubmitButton({
    label,
    pendingLabel,
}: {
    label: string;
    pendingLabel: string;
}) {
    // До lg форма длинная (метки, текст, картинка, 4 × 2 варианта) — кнопка
    // закреплена внизу экрана над панелью вкладок, чтобы сохранять, не
    // пролистывая. Именно fixed, не sticky: sticky не выходит за границы
    // формы, а она начинается ниже панели публикации и меток — на первом
    // экране кнопки не было бы. Место под неё — ADMIN_FORM_FIXED_SAVE_SPACE.
    // С lg — обычная кнопка в конце формы (панели вкладок нет).
    return (
        <div className="fixed inset-x-0 bottom-[calc(var(--site-tab-bar-height)+env(safe-area-inset-bottom))] z-30 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur sm:px-8 lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
            <SubmitButton
                pendingLabel={pendingLabel}
                className="w-full lg:w-auto"
            >
                {label}
            </SubmitButton>
        </div>
    );
}

type AudioCreditField = keyof AdminQuestionDetail['audioCredit'];

const AUDIO_CREDIT_FIELDS: ReadonlyArray<{
    field: AudioCreditField;
    name: string;
    label:
        | 'formAudioTrack'
        | 'formAudioComposer'
        | 'formAudioPerformer'
        | 'formAudioSource';
}> = [
    { field: 'track', name: 'audioTrack', label: 'formAudioTrack' },
    { field: 'composer', name: 'audioComposer', label: 'formAudioComposer' },
    { field: 'performer', name: 'audioPerformer', label: 'formAudioPerformer' },
    { field: 'source', name: 'audioSource', label: 'formAudioSource' },
];

/**
 * Клип и подпись трека AUDIO_GUESS. Плеер — обычный `<audio controls>`:
 * админке нужен только «послушать», игровой плеер с разблокировкой iOS
 * здесь лишний.
 */
function AdminQuestionAudioFields({
    dictionary,
    currentClipUrl,
    newClipPreviewUrl,
    onClipFileChange,
    credit,
    onCreditChange,
}: {
    dictionary: Dictionary;
    currentClipUrl: string | null;
    newClipPreviewUrl: string | null;
    onClipFileChange: (file: File | null) => void;
    credit: AdminQuestionDetail['audioCredit'];
    onCreditChange: (field: AudioCreditField, value: string) => void;
}) {
    const playerSrc = newClipPreviewUrl ?? currentClipUrl;

    return (
        <fieldset className="flex flex-col gap-3">
            <legend className="font-medium text-foreground">
                {dictionary.admin.formPromptAudio}
            </legend>

            {currentClipUrl ? (
                <input
                    type="hidden"
                    name="promptAudioUrl"
                    value={currentClipUrl}
                />
            ) : null}

            <label className="flex flex-col gap-2 text-sm text-foreground">
                <span>{dictionary.admin.formPromptImageFile}</span>
                <input
                    type="file"
                    name="promptAudioFile"
                    accept="audio/mpeg,.mp3"
                    required={!currentClipUrl}
                    onChange={(event) => {
                        onClipFileChange(event.target.files?.[0] ?? null);
                    }}
                    className={fieldClassName}
                />
                <span className="text-sm text-muted">
                    {dictionary.admin.formPromptAudioFileHint}
                </span>
            </label>

            {playerSrc ? (
                <figure className="flex flex-col gap-2">
                    <audio
                        key={playerSrc}
                        src={playerSrc}
                        controls
                        preload="metadata"
                        className="w-full"
                    />
                    <figcaption className="text-sm text-muted">
                        {newClipPreviewUrl ? (
                            dictionary.admin.formPromptAudioNewFile
                        ) : (
                            <>
                                {dictionary.admin.formPromptImageCurrent}:{' '}
                                <span className="break-all text-foreground">
                                    {currentClipUrl}
                                </span>
                            </>
                        )}
                    </figcaption>
                </figure>
            ) : null}

            <div className={bilingualGridClassName}>
                {AUDIO_CREDIT_FIELDS.map(({ field, name, label }) => (
                    <label
                        key={field}
                        className="flex flex-col gap-2 text-sm text-foreground"
                    >
                        <span>{dictionary.admin[label]}</span>
                        <input
                            type="text"
                            name={name}
                            maxLength={200}
                            value={credit[field]}
                            onChange={(event) => {
                                onCreditChange(field, event.target.value);
                            }}
                            className={fieldClassName}
                        />
                    </label>
                ))}
            </div>
            <span className="text-sm text-muted">
                {dictionary.admin.formAudioCreditHint}
            </span>
        </fieldset>
    );
}

export function AdminQuestionForm({
    locale,
    dictionary,
    mode = 'create',
    initialValues,
    listBack,
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
    // Клип AUDIO_GUESS не попадает в поле URL картинки: при смене типа на
    // IMAGE_GUESS путь к MP3 не должен уйти как картинка.
    const initialAudioUrl =
        isEdit &&
        initialValues!.type === 'AUDIO_GUESS' &&
        isQuizAudioPublicUrl(initialValues!.promptImageUrl ?? '')
            ? initialValues!.promptImageUrl!.trim()
            : null;
    const [promptImageUrl, setPromptImageUrl] = useState(
        isEdit && initialValues!.type !== 'AUDIO_GUESS'
            ? (initialValues!.promptImageUrl ?? '')
            : '',
    );
    const [audioCredit, setAudioCredit] = useState(() =>
        isEdit
            ? initialValues!.audioCredit
            : { track: '', composer: '', performer: '', source: '' },
    );
    const [difficulty, setDifficulty] = useState<Difficulty>(
        isEdit ? initialValues!.difficulty : 'EASY',
    );
    // Устаревшая колонка: домен — Question.domainId (ADR Content taxonomy).
    // Поле не показываем, значение уходит как было, пока колонку не удалят.
    const category = isEdit ? initialValues!.category : 'video-games';
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
    /** blob: URL выбранного файла; сбрасывается при reset формы и смене типа. */
    const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);

    // Освобождаем blob: при замене файла / unmount — иначе утечка памяти.
    useEffect(() => {
        if (!filePreviewUrl) {
            return;
        }

        return () => {
            URL.revokeObjectURL(filePreviewUrl);
        };
    }, [filePreviewUrl]);

    if (isEdit && !initialValues) {
        return null;
    }

    const editValues = isEdit ? initialValues : undefined;
    const urlPreviewSrc = getPreviewableImageUrl(promptImageUrl);
    const imagePreviewSrc = filePreviewUrl ?? urlPreviewSrc;

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
        <div className={ADMIN_FORM_FIXED_SAVE_SPACE}>
            <form
                action={formAction}
                // React 19 сбрасывает форму после action → file input пуст,
                // превью «нового файла» тоже должно уйти.
                onReset={() => {
                    setFilePreviewUrl(null);
                }}
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
                {isEdit && listBack ? (
                    <input
                        type="hidden"
                        name={ADMIN_QUESTION_LIST_BACK_PARAM}
                        value={listBack}
                    />
                ) : null}

                <fieldset className="flex flex-col gap-3">
                    <legend className="font-medium text-foreground">
                        {dictionary.admin.formQuestionText}
                    </legend>

                    <div className={bilingualGridClassName}>
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
                    </div>
                </fieldset>

                <label className="flex flex-col gap-2 text-sm text-foreground">
                    <span>{dictionary.admin.formQuestionType}</span>
                    <select
                        name="questionType"
                        value={questionType}
                        onChange={(event) => {
                            const nextType = toQuestionType(event.target.value);

                            setQuestionType(nextType);

                            // Смена типа размонтирует file input — старое превью ложное.
                            setFilePreviewUrl(null);

                            const defaultText =
                                nextType === 'IMAGE_GUESS'
                                    ? IMAGE_GUESS_DEFAULT_TEXT
                                    : nextType === 'AUDIO_GUESS'
                                      ? AUDIO_GUESS_DEFAULT_TEXT
                                      : null;

                            if (defaultText && !isEdit) {
                                setQuestionTextRu((current) =>
                                    current.trim() ? current : defaultText.ru,
                                );
                                setQuestionTextEn((current) =>
                                    current.trim() ? current : defaultText.en,
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
                        <option value="AUDIO_GUESS">
                            {dictionary.admin.formQuestionTypeAudioGuess}
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
                                onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    setFilePreviewUrl(
                                        file ? URL.createObjectURL(file) : null,
                                    );
                                }}
                                className={fieldClassName}
                            />
                            <span className="text-sm text-muted">
                                {dictionary.admin.formPromptImageFileHint}
                            </span>
                        </label>

                        {/* Прежний URL для delete action берёт из БД, не из формы. */}
                        {imagePreviewSrc ? (
                            <figure className="flex flex-col gap-2">
                                <div className="flex items-center justify-center overflow-hidden rounded-md border border-border bg-surface-muted">
                                    {/* eslint-disable-next-line @next/next/no-img-element -- admin preview: весь кадр, blob: или произвольный URL */}
                                    <img
                                        key={imagePreviewSrc}
                                        src={imagePreviewSrc}
                                        alt={
                                            dictionary.admin
                                                .formPromptImagePreviewAlt
                                        }
                                        decoding="async"
                                        className="max-h-72 w-full object-contain object-center"
                                    />
                                </div>
                                <figcaption className="text-sm text-muted">
                                    {filePreviewUrl ? (
                                        dictionary.admin.formPromptImageNewFile
                                    ) : (
                                        <>
                                            {
                                                dictionary.admin
                                                    .formPromptImageCurrent
                                            }
                                            :{' '}
                                            <span className="break-all text-foreground">
                                                {urlPreviewSrc}
                                            </span>
                                        </>
                                    )}
                                </figcaption>
                            </figure>
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

                {questionType === 'AUDIO_GUESS' ? (
                    <AdminQuestionAudioFields
                        dictionary={dictionary}
                        currentClipUrl={initialAudioUrl}
                        newClipPreviewUrl={filePreviewUrl}
                        onClipFileChange={(file) => {
                            setFilePreviewUrl(
                                file ? URL.createObjectURL(file) : null,
                            );
                        }}
                        credit={audioCredit}
                        onCreditChange={(field, value) => {
                            setAudioCredit((current) => ({
                                ...current,
                                [field]: value,
                            }));
                        }}
                    />
                ) : null}

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

                <input type="hidden" name="category" value={category} />

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

                            <div className={bilingualGridClassName}>
                                <label className="flex flex-col gap-2 text-sm text-foreground">
                                    <span>
                                        {dictionary.admin.formOptionTextRu}
                                    </span>
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
                                    <span>
                                        {dictionary.admin.formOptionTextEn}
                                    </span>
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
        </div>
    );
}
