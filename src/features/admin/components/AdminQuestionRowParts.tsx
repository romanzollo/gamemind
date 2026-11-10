'use client';

/**
 * Части строки списка вопросов админки (карточка на телефоне и строка
 * таблицы на компьютере): бейджи, превью, верный ответ, мета, действия.
 * Чистая разметка без состояния; собирает их AdminQuestionsTable.
 */

import Link from 'next/link';

import { AdminPromptImage } from '@/features/admin/components/AdminPromptImage';
import { useAdminQuestionListBack } from '@/features/admin/components/AdminQuestionActionFields';
import { AdminQuestionRowMoreActions } from '@/features/admin/components/AdminQuestionRowMoreActions';
import { buildAdminQuestionEditHref } from '@/features/admin/lib/admin-question-list-back';
import type { Dictionary, Locale } from '@/shared/i18n';
import type { Difficulty, QuestionPublicationStatus } from '@/types';
import type { AdminQuestionListItem } from '../types';

export const checkboxClassName =
    'size-4 shrink-0 cursor-pointer accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/** Compact для list-карточек: min-h-10 визуально раздувал низ карточки. */
export const rowActionClassName =
    'inline-flex min-h-8 items-center rounded-sm px-0.5 text-sm font-medium underline-offset-2 motion-safe:transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export function DifficultyChip({ difficulty }: { difficulty: Difficulty }) {
    return (
        <span className="inline-flex rounded-sm bg-surface-muted px-1.5 py-0.5 font-mono text-2xs font-medium tabular-nums tracking-wide text-foreground">
            {difficulty}
        </span>
    );
}

function publicationStatusLabel(
    status: QuestionPublicationStatus,
    labels: Dictionary['admin'],
): string {
    switch (status) {
        case 'DRAFT':
            return labels.publicationDraft;
        case 'IN_REVIEW':
            return labels.publicationInReview;
        case 'PUBLISHED':
            return labels.publicationPublished;
    }
}

/**
 * Badge publicationStatus: muted = draft, warning = review, success = live path.
 * Только токены Scoreboard — без one-off цветов.
 */
export function PublicationBadge({
    status,
    labels,
}: {
    status: QuestionPublicationStatus;
    labels: Dictionary['admin'];
}) {
    const toneClassName =
        status === 'PUBLISHED'
            ? 'text-success'
            : status === 'IN_REVIEW'
              ? 'text-warning'
              : 'text-muted';

    return (
        <span
            className={`inline-flex rounded-sm bg-surface-muted px-1.5 py-0.5 text-2xs font-medium tracking-wide ${toneClassName}`}
        >
            {publicationStatusLabel(status, labels)}
        </span>
    );
}

/**
 * Действия строки — одинаково на телефоне и компьютере: «Править» на виду,
 * остальное (публикация, витрина, удаление) в меню «⋯». На телефоне ряд
 * из четырёх ссылок с «Удалить» прямо под пальцем был лишним риском.
 */
export function QuestionRowActions({
    entry,
    labels,
    locale,
    workingLabel,
}: {
    entry: AdminQuestionListItem;
    labels: Dictionary['admin'];
    locale: Locale;
    workingLabel: string;
}) {
    const editHref = buildAdminQuestionEditHref(
        locale,
        entry.id,
        useAdminQuestionListBack(),
    );

    return (
        <div className="flex flex-nowrap items-center gap-x-3">
            {/* prefetch off: 25 строк × RSC-запрос с auth на каждый скролл. */}
            <Link
                href={editHref}
                prefetch={false}
                className={`${rowActionClassName} text-primary hover:text-primary-hover`}
            >
                {labels.editLink}
            </Link>

            <AdminQuestionRowMoreActions
                questionId={entry.id}
                publicationStatus={entry.publicationStatus}
                isActive={entry.isActive}
                locale={locale}
                labels={labels}
                workingLabel={workingLabel}
            />
        </div>
    );
}

export function PromptThumb({
    url,
    alt,
}: {
    url: string;
    alt: string;
}) {
    // Desktop queue preview: достаточно крупно, чтобы распознать screenshot,
    // но всё ещё не превращает admin row в галерею. 112×64 = размер рамки.
    return (
        <div className="h-16 w-28 shrink-0 overflow-hidden rounded-md border border-border bg-surface-muted">
            <AdminPromptImage
                src={url}
                alt={alt}
                width={112}
                height={64}
                className="h-full w-full object-contain object-center"
            />
        </div>
    );
}

export function MissingPromptThumb({ label }: { label: string }) {
    return (
        <div
            className="flex h-11 w-16 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-surface-muted px-1 text-center text-2xs leading-tight text-muted"
            title={label}
        >
            IMG
        </div>
    );
}

/** Full-bleed preview наверху list-карточки IMAGE_GUESS (phone/tablet). */
export function CardHeroImage({
    url,
    alt,
    emptyLabel,
}: {
    url: string | null;
    alt: string;
    emptyLabel: string;
}) {
    // Ближе к lg: max-h, иначе 16:9 на всю ширину ≈ гигант. Видимый кадр
    // не шире ~400px (max-h-56 × 16:9) — ужимаем под 320, на телефоне 2x = 640.
    // object-contain — админ видит весь кадр (cover сильно кропал скриншоты).
    return (
        <div className="flex w-full items-center justify-center bg-surface-muted">
            {url ? (
                <AdminPromptImage
                    src={url}
                    alt={alt}
                    width={320}
                    height={180}
                    className="max-h-44 w-full object-contain object-center sm:max-h-52 md:max-h-56"
                />
            ) : (
                <div className="flex h-36 w-full items-center justify-center border-b border-dashed border-border px-4 text-center text-xs text-muted sm:h-40">
                    {emptyLabel}
                </div>
            )}
        </div>
    );
}

/**
 * Клип AUDIO_GUESS в строке списка. `preload="none"`: список не качает
 * все клипы страницы — файл грузится только по нажатию «play».
 */
export function ListClipPlayer({ url }: { url: string | null }) {
    if (!url) {
        return null;
    }

    return (
        <audio
            src={url}
            controls
            preload="none"
            className="mt-2 h-9 w-full max-w-xs"
        />
    );
}

/**
 * Верный ответ под текстом IMAGE_GUESS / AUDIO_GUESS: текст у таких вопросов
 * один на всех, без ответа строки различаются только картинкой или клипом.
 */
export function CorrectAnswerLine({
    answer,
    label,
}: {
    answer: string | null;
    label: string;
}) {
    if (!answer) {
        return null;
    }

    return (
        <p className="mt-0.5 truncate text-xs">
            <span className="text-muted">{label}: </span>
            <span className="font-medium text-foreground">{answer}</span>
        </p>
    );
}

export function ListCardMeta({
    entry,
    locale,
}: {
    entry: AdminQuestionListItem;
    locale: Locale;
}) {
    return (
        <p className="mt-1 text-xs text-muted">
            <span>{entry.category}</span>
            <span aria-hidden className="mx-1.5">
                ·
            </span>
            <time className="font-mono tabular-nums">
                {new Date(entry.createdAt).toLocaleDateString(locale)}
            </time>
        </p>
    );
}

export function ListCardBadges({
    entry,
    labels,
    showTypeLabel,
    typeLabel,
}: {
    entry: AdminQuestionListItem;
    labels: Dictionary['admin'];
    showTypeLabel: boolean;
    typeLabel: string;
}) {
    return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <DifficultyChip difficulty={entry.difficulty} />
            <PublicationBadge
                status={entry.publicationStatus}
                labels={labels}
            />
            <span
                className={
                    entry.isActive
                        ? 'text-xs font-medium text-success'
                        : 'text-xs font-medium text-muted'
                }
            >
                {entry.isActive
                    ? labels.statusActive
                    : labels.statusInactive}
            </span>
            {showTypeLabel ? (
                <span className="text-xs text-muted">{typeLabel}</span>
            ) : null}
        </div>
    );
}

/** Desktop: isActive + publication в одной ячейке — меньше давления на actions. */
export function StatusPublicationCell({
    entry,
    labels,
}: {
    entry: AdminQuestionListItem;
    labels: Dictionary['admin'];
}) {
    return (
        <div className="flex min-w-30 flex-col items-start gap-1">
            <span
                className={
                    entry.isActive
                        ? 'text-xs font-medium text-success'
                        : 'text-xs font-medium text-muted'
                }
            >
                {entry.isActive ? labels.statusActive : labels.statusInactive}
            </span>
            <PublicationBadge
                status={entry.publicationStatus}
                labels={labels}
            />
        </div>
    );
}

/**
 * Одна bulk-форма: locale + только id, к которым применимо действие.
 * Успех: toast + router.refresh() без redirect — scroll списка не сбрасывается.
 * Quality-block publish/submit по-прежнему может redirect на edit.
 */

export function RowSelectCheckbox({
    id,
    checked,
    label,
    onToggle,
}: {
    id: string;
    checked: boolean;
    label: string;
    onToggle: (id: string) => void;
}) {
    return (
        <input
            type="checkbox"
            className={checkboxClassName}
            checked={checked}
            aria-label={label}
            onChange={() => onToggle(id)}
        />
    );
}
