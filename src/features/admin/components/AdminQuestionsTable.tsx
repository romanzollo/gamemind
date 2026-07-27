import Link from 'next/link';

import {
    activateQuestionAction,
    deactivateQuestionAction,
    deleteQuestionAction,
    publishQuestionAction,
    returnQuestionToDraftAction,
    submitQuestionForReviewAction,
} from '@/features/admin/actions/questions';
import { AdminQuestionRowMoreActions } from '@/features/admin/components/AdminQuestionRowMoreActions';
import type { Dictionary, Locale } from '@/shared/i18n';
import { EmptyState, SubmitButton } from '@/shared/ui';
import type { Difficulty, QuestionPublicationStatus } from '@/types';
import type { AdminQuestionListItem } from '../types';

/**
 * Список вопросов admin: Scoreboard Editorial.
 *
 * Mobile/tablet: отдельные surface-блоки; IMAGE — full-bleed hero сверху
 * (16:10), текст и actions ниже. Desktop: таблица + difficulty chip.
 *
 * Две оси статуса: isActive (витрина) и publicationStatus (редактура).
 * Кнопки публикации только для разрешённых переходов (см. DECISIONS).
 *
 * Desktop actions density: снаружи только Edit (одинаково во всех строках);
 * publication / activate / deactivate / delete — в «Ещё».
 * В меню «вперёд»-шаги взаимоисключающие: DRAFT → На ревью; IN_REVIEW → Опубликовать
 * (как Активировать ↔ Деактивировать). Прямой publish с DRAFT — на edit-панели.
 */

type AdminQuestionsTableProps = {
    entries: AdminQuestionListItem[];
    labels: Dictionary['admin'];
    locale: Locale;
    emptyTitle?: string;
};

/** Compact для list-карточек: min-h-10 визуально раздувал низ карточки. */
const rowActionClassName =
    'inline-flex min-h-8 items-center rounded-sm px-0.5 text-sm font-medium underline-offset-2 motion-safe:transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

function QuestionActionFields({
    locale,
    questionId,
}: {
    locale: Locale;
    questionId: string;
}) {
    return (
        <>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="questionId" value={questionId} />
        </>
    );
}

function DifficultyChip({ difficulty }: { difficulty: Difficulty }) {
    return (
        <span className="inline-flex rounded-sm bg-surface-muted px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums tracking-wide text-foreground">
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
function PublicationBadge({
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
            className={`inline-flex rounded-sm bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium tracking-wide ${toneClassName}`}
        >
            {publicationStatusLabel(status, labels)}
        </span>
    );
}

/**
 * Publication CTA по статусу — взаимоисключающие «вперёд»-шаги
 * (как Activate ↔ Deactivate): не показывать сразу «На ревью» и «Опубликовать».
 *
 * List UI = линейный пайплайн DRAFT → IN_REVIEW → PUBLISHED.
 * Прямой DRAFT → PUBLISHED остаётся на edit-панели (solo-admin shortcut, ADR).
 *
 * Mobile: те же CTA видимы без «Ещё».
 * Desktop: те же CTA внутри AdminRowMoreMenu (className/formClassName).
 */
function PublicationRowActions({
    entry,
    labels,
    locale,
    className = rowActionClassName,
    formClassName = 'inline-flex',
}: {
    entry: AdminQuestionListItem;
    labels: Dictionary['admin'];
    locale: Locale;
    className?: string;
    formClassName?: string;
}) {
    // Новый JSX на каждый form — не переиспользовать один fragment (React key warning).
    if (entry.publicationStatus === 'DRAFT') {
        return (
            <form
                action={submitQuestionForReviewAction}
                className={formClassName}
            >
                <QuestionActionFields
                    locale={locale}
                    questionId={entry.id}
                />
                <SubmitButton
                    unstyled
                    className={`${className} cursor-pointer text-warning hover:opacity-90`}
                >
                    {labels.submitForReviewButton}
                </SubmitButton>
            </form>
        );
    }

    if (entry.publicationStatus === 'IN_REVIEW') {
        return (
            <>
                <form
                    action={publishQuestionAction}
                    className={formClassName}
                >
                    <QuestionActionFields
                        locale={locale}
                        questionId={entry.id}
                    />
                    <SubmitButton
                        unstyled
                        className={`${className} cursor-pointer text-success hover:opacity-90`}
                    >
                        {labels.publishButton}
                    </SubmitButton>
                </form>
                <form
                    action={returnQuestionToDraftAction}
                    className={formClassName}
                >
                    <QuestionActionFields
                        locale={locale}
                        questionId={entry.id}
                    />
                    <SubmitButton
                        unstyled
                        className={`${className} cursor-pointer text-warning hover:opacity-90`}
                    >
                        {labels.returnToDraftButton}
                    </SubmitButton>
                </form>
            </>
        );
    }

    // PUBLISHED
    return (
        <form
            action={returnQuestionToDraftAction}
            className={formClassName}
        >
            <QuestionActionFields locale={locale} questionId={entry.id} />
            <SubmitButton
                unstyled
                className={`${className} cursor-pointer text-warning hover:opacity-90`}
            >
                {labels.returnToDraftButton}
            </SubmitButton>
        </form>
    );
}

function ActiveToggleAction({
    entry,
    labels,
    locale,
    className,
    formClassName,
}: {
    entry: AdminQuestionListItem;
    labels: Dictionary['admin'];
    locale: Locale;
    className: string;
    formClassName: string;
}) {
    if (entry.isActive) {
        return (
            <form action={deactivateQuestionAction} className={formClassName}>
                <QuestionActionFields locale={locale} questionId={entry.id} />
                <SubmitButton
                    unstyled
                    className={`${className} cursor-pointer text-warning hover:opacity-90`}
                >
                    {labels.deactivateButton}
                </SubmitButton>
            </form>
        );
    }

    return (
        <form action={activateQuestionAction} className={formClassName}>
            <QuestionActionFields locale={locale} questionId={entry.id} />
            <SubmitButton
                unstyled
                className={`${className} cursor-pointer text-success hover:opacity-90`}
            >
                {labels.activateButton}
            </SubmitButton>
        </form>
    );
}

function DeleteAction({
    entry,
    labels,
    locale,
    className,
    formClassName,
}: {
    entry: AdminQuestionListItem;
    labels: Dictionary['admin'];
    locale: Locale;
    className: string;
    formClassName: string;
}) {
    return (
        <form action={deleteQuestionAction} className={formClassName}>
            <QuestionActionFields locale={locale} questionId={entry.id} />
            <SubmitButton
                unstyled
                className={`${className} cursor-pointer text-danger hover:opacity-90`}
            >
                {labels.deleteButton}
            </SubmitButton>
        </form>
    );
}

function QuestionRowActions({
    entry,
    labels,
    locale,
    layout = 'wrap',
}: {
    entry: AdminQuestionListItem;
    labels: Dictionary['admin'];
    locale: Locale;
    /** wrap = mobile cards; compact = desktop queue row. */
    layout?: 'wrap' | 'compact';
}) {
    if (layout === 'compact') {
        return (
            <div className="flex flex-nowrap items-center gap-x-3">
                <Link
                    href={`/${locale}/admin/questions/${entry.id}/edit`}
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
                />
            </div>
        );
    }

    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link
                href={`/${locale}/admin/questions/${entry.id}/edit`}
                className={`${rowActionClassName} text-primary hover:text-primary-hover`}
            >
                {labels.editLink}
            </Link>

            <PublicationRowActions
                entry={entry}
                labels={labels}
                locale={locale}
            />

            <ActiveToggleAction
                entry={entry}
                labels={labels}
                locale={locale}
                className={rowActionClassName}
                formClassName="inline-flex"
            />

            <DeleteAction
                entry={entry}
                labels={labels}
                locale={locale}
                className={rowActionClassName}
                formClassName="inline-flex"
            />
        </div>
    );
}

function PromptThumb({
    url,
    alt,
}: {
    url: string;
    alt: string;
}) {
    // Desktop queue preview: достаточно крупно, чтобы распознать screenshot,
    // но всё ещё не превращает admin row в галерею.
    return (
        <div className="h-16 w-28 shrink-0 overflow-hidden rounded-md border border-border bg-surface-muted">
            {/* eslint-disable-next-line @next/next/no-img-element -- admin preview должен показывать весь кадр, не LCP-контент */}
            <img
                src={url}
                alt={alt}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-contain object-center"
            />
        </div>
    );
}

function MissingPromptThumb({ label }: { label: string }) {
    return (
        <div
            className="flex h-11 w-16 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-surface-muted px-1 text-center text-[10px] leading-tight text-muted"
            title={label}
        >
            IMG
        </div>
    );
}

/** Full-bleed preview наверху list-карточки IMAGE_GUESS (phone/tablet). */
function CardHeroImage({
    url,
    alt,
    emptyLabel,
}: {
    url: string | null;
    alt: string;
    emptyLabel: string;
}) {
    // 320: достаточно крупно. Ближе к lg: max-h, иначе 16:10 на всю ширину ≈ гигант.
    // object-contain — админ видит весь кадр (cover сильно кропал скриншоты).
    return (
        <div className="flex w-full items-center justify-center bg-surface-muted">
            {url ? (
                /* eslint-disable-next-line @next/next/no-img-element -- admin list preview должен сохранять весь кадр через object-contain */
                <img
                    src={url}
                    alt={alt}
                    loading="lazy"
                    decoding="async"
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

function ListCardMeta({
    entry,
    labels,
    locale,
}: {
    entry: AdminQuestionListItem;
    labels: Dictionary['admin'];
    locale: Locale;
}) {
    return (
        <p className="mt-1 text-xs text-muted">
            <span>{entry.category}</span>
            <span aria-hidden className="mx-1.5">
                ·
            </span>
            <time className="font-mono tabular-nums">
                {entry.createdAt.toLocaleDateString(locale)}
            </time>
        </p>
    );
}

function ListCardBadges({
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
function StatusPublicationCell({
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

export function AdminQuestionsTable({
    entries,
    labels,
    locale,
    emptyTitle,
}: AdminQuestionsTableProps) {
    if (entries.length === 0) {
        return (
            <EmptyState
                className="mt-6"
                title={emptyTitle ?? labels.empty}
            />
        );
    }

    return (
        <div className="mt-6">
            <ul className="space-y-3 lg:hidden">
                {entries.map((entry) => {
                    const isImage = entry.type === 'IMAGE_GUESS';
                    const typeLabel = isImage
                        ? labels.formQuestionTypeImageGuess
                        : labels.formQuestionTypeText;

                    return (
                        <li
                            key={entry.id}
                            className={
                                isImage
                                    ? 'overflow-hidden rounded-lg border border-border bg-surface'
                                    : 'rounded-lg border border-border bg-surface px-3.5 py-3'
                            }
                        >
                            {isImage ? (
                                <>
                                    <CardHeroImage
                                        url={entry.promptImageUrl}
                                        alt={entry.text}
                                        emptyLabel={typeLabel}
                                    />
                                    <div className="flex flex-col gap-2 px-3.5 py-3">
                                        <div className="min-w-0">
                                            <ListCardBadges
                                                entry={entry}
                                                labels={labels}
                                                showTypeLabel
                                                typeLabel={typeLabel}
                                            />
                                            <p className="mt-1.5 line-clamp-2 text-sm font-medium leading-snug text-foreground">
                                                {entry.text}
                                            </p>
                                            <ListCardMeta
                                                entry={entry}
                                                labels={labels}
                                                locale={locale}
                                            />
                                        </div>
                                        <QuestionRowActions
                                            entry={entry}
                                            labels={labels}
                                            locale={locale}
                                        />
                                    </div>
                                </>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    <div className="min-w-0">
                                        <ListCardBadges
                                            entry={entry}
                                            labels={labels}
                                            showTypeLabel={false}
                                            typeLabel={typeLabel}
                                        />
                                        <p className="mt-1 line-clamp-2 text-sm font-medium leading-snug text-foreground">
                                            {entry.text}
                                        </p>
                                        <ListCardMeta
                                            entry={entry}
                                            labels={labels}
                                            locale={locale}
                                        />
                                    </div>
                                    <QuestionRowActions
                                        entry={entry}
                                        labels={labels}
                                        locale={locale}
                                    />
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>

            <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface lg:block">
                {/*
                  Desktop queue row: вопрос + мета, состояние, дата, actions.
                  Меньше колонок = стабильнее RU/EN и ближе к реальным CMS/admin.
                */}
                <table className="w-full min-w-3xl border-collapse text-left text-sm">
                    <thead>
                        <tr className="border-b border-border bg-surface-muted text-muted">
                            <th className="w-[54%] px-4 py-2.5 font-medium">
                                {labels.tableQuestion}
                            </th>
                            <th className="w-32 whitespace-nowrap px-3 py-2.5 font-medium">
                                {labels.tableStatus}
                            </th>
                            <th className="w-28 whitespace-nowrap px-3 py-2.5 font-medium">
                                {labels.tableCreated}
                            </th>
                            <th className="w-48 px-4 py-2.5 font-medium">
                                {labels.tableActions}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {entries.map((entry) => {
                            const isImage = entry.type === 'IMAGE_GUESS';
                            const typeLabel = isImage
                                ? labels.formQuestionTypeImageGuess
                                : labels.formQuestionTypeText;

                            return (
                                <tr
                                    key={entry.id}
                                    className="group border-b border-border last:border-b-0 hover:bg-surface-hover/40"
                                >
                                    <td className="min-w-0 px-4 py-3 text-foreground">
                                        <div className="flex items-start gap-3">
                                            {isImage ? (
                                                entry.promptImageUrl ? (
                                                    <PromptThumb
                                                        url={
                                                            entry.promptImageUrl
                                                        }
                                                        alt={entry.text}
                                                    />
                                                ) : (
                                                    <MissingPromptThumb
                                                        label={typeLabel}
                                                    />
                                                )
                                            ) : (
                                                <span
                                                    className="mt-0.5 shrink-0 rounded-sm bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide text-muted"
                                                    title={typeLabel}
                                                >
                                                    TEXT
                                                </span>
                                            )}
                                            <div className="min-w-0">
                                                <span className="line-clamp-2 text-sm font-medium leading-snug">
                                                    {entry.text}
                                                </span>
                                                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                                                    <DifficultyChip
                                                        difficulty={
                                                            entry.difficulty
                                                        }
                                                    />
                                                    <span>{entry.category}</span>
                                                    {isImage ? (
                                                        <span>{typeLabel}</span>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-3 py-3 align-top">
                                        <StatusPublicationCell
                                            entry={entry}
                                            labels={labels}
                                        />
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-3 font-mono text-sm tabular-nums text-muted">
                                        {entry.createdAt.toLocaleDateString(
                                            locale,
                                        )}
                                    </td>
                                    <td className="px-4 py-3 align-top">
                                        <QuestionRowActions
                                            entry={entry}
                                            labels={labels}
                                            locale={locale}
                                            layout="compact"
                                        />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
