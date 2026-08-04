'use client';

import { useState, type MouseEvent } from 'react';

import {
    buildAdminQuestionListHref,
    type AdminQuestionListFilters,
} from '@/features/admin/lib/parse-admin-question-list-filters';
import type { Dictionary, Locale } from '@/shared/i18n';
import { buttonClassName, PendingSpinner } from '@/shared/ui';

/**
 * Пагинация `/admin/questions` — Scoreboard Editorial, dense admin.
 *
 * Hard navigation (`location.assign`), не soft `<Link>` / RSC:
 * soft-nav после list-read в next dev (Windows + Neon) клинит connect —
 * тот же контракт, что у AdminQuestionsFilters. Prefetch выключен по сути
 * (полный GET). Ctrl/⌘+click остаётся через нативный `<a href>`.
 *
 * Pending: сразу spinner + aria-busy, пока браузер грузит следующую страницу.
 *
 * Mobile: Prev / «N из M» / Next.
 * Desktop: + компактный ряд номеров (1 … 4 5 6 … N).
 */

type AdminQuestionsPaginationProps = {
    locale: Locale;
    filters: AdminQuestionListFilters;
    page: number;
    totalPages: number;
    totalCount: number;
    from: number;
    to: number;
    labels: Dictionary['admin'];
    /** common.loading — подпись при переходе на другую страницу */
    loadingLabel: string;
};

type PageItem = number | 'ellipsis';

/** Компактный ряд страниц: всегда края + окно вокруг текущей. */
function buildPageItems(current: number, total: number): PageItem[] {
    if (total <= 7) {
        return Array.from({ length: total }, (_, index) => index + 1);
    }

    const items: PageItem[] = [1];
    const windowStart = Math.max(2, current - 1);
    const windowEnd = Math.min(total - 1, current + 1);

    if (windowStart > 2) {
        items.push('ellipsis');
    }

    for (let pageNum = windowStart; pageNum <= windowEnd; pageNum += 1) {
        items.push(pageNum);
    }

    if (windowEnd < total - 1) {
        items.push('ellipsis');
    }

    items.push(total);
    return items;
}

const pageLinkClassName = buttonClassName({
    variant: 'secondary',
    className:
        'inline-flex min-h-10 min-w-10 items-center justify-center px-2.5 text-sm tabular-nums sm:min-h-9',
});

const pageLinkActiveClassName = buttonClassName({
    variant: 'primary',
    className:
        'inline-flex min-h-10 min-w-10 items-center justify-center px-2.5 text-sm tabular-nums sm:min-h-9',
});

const pageLinkDisabledClassName = buttonClassName({
    variant: 'secondary',
    className:
        'inline-flex min-h-10 min-w-10 cursor-not-allowed items-center justify-center px-2.5 text-sm opacity-50 sm:min-h-9',
});

function isModifiedClick(event: MouseEvent<HTMLAnchorElement>): boolean {
    return (
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
    );
}

export function AdminQuestionsPagination({
    locale,
    filters,
    page,
    totalPages,
    totalCount,
    from,
    to,
    labels,
    loadingLabel,
}: AdminQuestionsPaginationProps) {
    const [isPending, setIsPending] = useState(false);

    if (totalCount === 0) {
        return null;
    }

    const summary = labels.paginationSummary
        .replace('{from}', String(from))
        .replace('{to}', String(to))
        .replace('{total}', String(totalCount));

    const pageStatus = labels.paginationPageStatus
        .replace('{page}', String(page))
        .replace('{totalPages}', String(totalPages));

    function hrefForPage(nextPage: number) {
        return buildAdminQuestionListHref(locale, {
            ...filters,
            page: nextPage,
        });
    }

    function hardNavigate(
        event: React.MouseEvent<HTMLAnchorElement>,
        href: string,
    ) {
        if (isPending || isModifiedClick(event)) {
            return;
        }
        event.preventDefault();
        setIsPending(true);
        window.location.assign(href);
    }

    const hasPrev = page > 1;
    const hasNext = page < totalPages;
    const pageItems = buildPageItems(page, totalPages);

    return (
        <nav
            className={`mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between ${isPending ? 'opacity-80' : ''}`}
            aria-label={labels.paginationNavLabel}
            aria-busy={isPending}
        >
            <div className="flex min-w-0 flex-wrap items-center gap-2">
                <p className="font-mono text-xs tabular-nums tracking-wide text-muted sm:text-sm">
                    {summary}
                </p>
                {isPending ? (
                    <span
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted"
                        role="status"
                    >
                        <PendingSpinner />
                        {loadingLabel}
                    </span>
                ) : null}
            </div>

            <div
                className={`flex flex-wrap items-center gap-2 ${isPending ? 'pointer-events-none' : ''}`}
            >
                {hasPrev ? (
                    <a
                        href={hrefForPage(page - 1)}
                        className={pageLinkClassName}
                        aria-label={labels.paginationPrev}
                        onClick={(event) => {
                            hardNavigate(event, hrefForPage(page - 1));
                        }}
                    >
                        {labels.paginationPrev}
                    </a>
                ) : (
                    <span
                        className={pageLinkDisabledClassName}
                        aria-disabled="true"
                    >
                        {labels.paginationPrev}
                    </span>
                )}

                <p
                    className="min-w-18 text-center font-mono text-xs tabular-nums text-muted sm:hidden"
                    aria-current="page"
                >
                    {pageStatus}
                </p>

                <div className="hidden items-center gap-1 sm:flex">
                    {pageItems.map((item, index) => {
                        if (item === 'ellipsis') {
                            return (
                                <span
                                    key={`ellipsis-${index}`}
                                    className="inline-flex min-w-8 justify-center font-mono text-xs text-muted"
                                    aria-hidden="true"
                                >
                                    …
                                </span>
                            );
                        }

                        const isCurrent = item === page;

                        if (isCurrent) {
                            return (
                                <span
                                    key={item}
                                    className={pageLinkActiveClassName}
                                    aria-current="page"
                                >
                                    {item}
                                </span>
                            );
                        }

                        const href = hrefForPage(item);

                        return (
                            <a
                                key={item}
                                href={href}
                                className={pageLinkClassName}
                                onClick={(event) => {
                                    hardNavigate(event, href);
                                }}
                            >
                                {item}
                            </a>
                        );
                    })}
                </div>

                {hasNext ? (
                    <a
                        href={hrefForPage(page + 1)}
                        className={pageLinkClassName}
                        aria-label={labels.paginationNext}
                        onClick={(event) => {
                            hardNavigate(event, hrefForPage(page + 1));
                        }}
                    >
                        {labels.paginationNext}
                    </a>
                ) : (
                    <span
                        className={pageLinkDisabledClassName}
                        aria-disabled="true"
                    >
                        {labels.paginationNext}
                    </span>
                )}
            </div>
        </nav>
    );
}
