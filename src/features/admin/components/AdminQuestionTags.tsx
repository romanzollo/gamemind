'use client';

import { useActionState, useId, useState } from 'react';

import type { AdminTagOption } from '@/entities/question/question-tags.repository';
import {
    mutateQuestionTagAction,
    type AdminQuestionTagsState,
} from '@/features/admin/actions/question-tags';
import type { Dictionary, Locale } from '@/shared/i18n';
import { InlineAlert, SubmitButton } from '@/shared/ui';

/**
 * Метки вопроса на странице edit: чипы с крестиком и поиск по каталогу.
 *
 * Отдельно от AdminQuestionForm: метки сохраняются сразу, без «Сохранить»
 * формы, и не трогают текст / варианты. Поиск — нативный datalist по
 * «название · измерение»; введённый текст сопоставляется с меткой на
 * клиенте, а сервер всё равно проверяет id (DECISIONS → Content taxonomy).
 */

type AdminQuestionTagsProps = {
    locale: Locale;
    questionId: string;
    tags: AdminTagOption[];
    options: AdminTagOption[];
    labels: Dictionary['admin']['tags'];
    workingLabel: string;
};

const INITIAL_STATE: AdminQuestionTagsState = { errorCode: null };

function tagLabel(tag: AdminTagOption, locale: Locale): string {
    return locale === 'en'
        ? `${tag.nameEn} · ${tag.facetNameEn}`
        : `${tag.nameRu} · ${tag.facetNameRu}`;
}

export function AdminQuestionTags({
    locale,
    questionId,
    tags,
    options,
    labels,
    workingLabel,
}: AdminQuestionTagsProps) {
    const [state, formAction] = useActionState(
        mutateQuestionTagAction,
        INITIAL_STATE,
    );
    const titleId = useId();

    const errorMessage =
        state.errorCode === 'UNKNOWN_TAG'
            ? labels.unknownTag
            : state.errorCode === 'SAVE_FAILED'
              ? labels.saveFailed
              : null;

    return (
        <section
            className="mt-6 rounded-lg border border-border bg-surface p-3 sm:p-4"
            aria-labelledby={titleId}
        >
            <h2
                id={titleId}
                className="font-display text-sm font-semibold tracking-wide text-foreground uppercase"
            >
                {labels.title}
            </h2>
            <p className="mt-1 text-sm text-muted">{labels.hint}</p>

            {tags.length === 0 ? (
                <p className="mt-3 text-sm text-muted">{labels.empty}</p>
            ) : (
                <form action={formAction} className="mt-3">
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="questionId" value={questionId} />
                    <input type="hidden" name="intent" value="remove" />
                    <ul className="flex flex-wrap gap-2">
                        {tags.map((tag) => {
                            const label = tagLabel(tag, locale);
                            return (
                                <li
                                    key={tag.id}
                                    className="inline-flex items-center gap-1 rounded-sm bg-surface-muted py-0.5 pr-0.5 pl-2 text-sm text-foreground"
                                >
                                    <span>{label}</span>
                                    <SubmitButton
                                        unstyled
                                        name="tagId"
                                        value={tag.id}
                                        pendingLabel={workingLabel}
                                        aria-label={labels.removeLabel.replace(
                                            '{name}',
                                            label,
                                        )}
                                        className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-sm text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                                    >
                                        ×
                                    </SubmitButton>
                                </li>
                            );
                        })}
                    </ul>
                </form>
            )}

            {/* key: после добавления поле очищается вместе с новым списком */}
            <AddTagForm
                key={tags.map((tag) => tag.id).join('|')}
                formAction={formAction}
                locale={locale}
                questionId={questionId}
                options={options}
                labels={labels}
                workingLabel={workingLabel}
            />

            {errorMessage ? (
                <InlineAlert className="mt-3">{errorMessage}</InlineAlert>
            ) : null}
        </section>
    );
}

function AddTagForm({
    formAction,
    locale,
    questionId,
    options,
    labels,
    workingLabel,
}: {
    formAction: (formData: FormData) => void;
    locale: Locale;
    questionId: string;
    options: AdminTagOption[];
    labels: Dictionary['admin']['tags'];
    workingLabel: string;
}) {
    const [query, setQuery] = useState('');
    const inputId = useId();
    const listId = useId();
    const tagId =
        options.find((tag) => tagLabel(tag, locale) === query.trim())?.id ?? '';

    return (
        <form
            action={formAction}
            className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
        >
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="questionId" value={questionId} />
            <input type="hidden" name="intent" value="add" />
            <input type="hidden" name="tagId" value={tagId} />
            <label
                htmlFor={inputId}
                className="flex flex-1 flex-col gap-1 text-sm text-foreground"
            >
                <span>{labels.addLabel}</span>
                <input
                    id={inputId}
                    type="text"
                    list={listId}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={labels.addPlaceholder}
                    autoComplete="off"
                    className="min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-foreground motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                />
            </label>
            <datalist id={listId}>
                {options.map((tag) => (
                    <option key={tag.id} value={tagLabel(tag, locale)} />
                ))}
            </datalist>
            <SubmitButton
                variant="secondary"
                pendingLabel={workingLabel}
                className="min-h-11 px-3 text-sm"
            >
                {labels.addButton}
            </SubmitButton>
        </form>
    );
}
