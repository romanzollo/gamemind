'use client';

/**
 * Фильтры списка пользователей: поиск по имени/почте и «Показывать гостей».
 *
 * Тот же контракт, что AdminQuestionsFilters: переходы — hard navigation
 * (`location.assign`), не soft RSC (dev-lab ADR про клин connect на Windows);
 * поиск с debounce, чтобы не бить Neon на каждый символ. Любая смена
 * фильтра возвращает на первую страницу.
 */

import { useEffect, useState } from 'react';

import {
    buildAdminUserListHref,
    type AdminUserListFilters,
} from '@/features/admin/lib/parse-admin-user-list-filters';
import type { Dictionary, Locale } from '@/shared/i18n';

const SEARCH_DEBOUNCE_MS = 400;

const fieldClassName =
    'min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

type AdminUsersFiltersProps = {
    locale: Locale;
    labels: Dictionary['admin'];
    filters: AdminUserListFilters;
};

export function AdminUsersFilters({
    locale,
    labels,
    filters,
}: AdminUsersFiltersProps) {
    const [searchText, setSearchText] = useState(filters.q);

    useEffect(() => {
        const trimmed = searchText.trim();
        if (trimmed === filters.q) {
            return;
        }

        const timer = setTimeout(() => {
            window.location.assign(
                buildAdminUserListHref(locale, {
                    ...filters,
                    q: trimmed.slice(0, 100),
                    page: 1,
                }),
            );
        }, SEARCH_DEBOUNCE_MS);

        return () => clearTimeout(timer);
    }, [searchText, filters, locale]);

    return (
        <div className="mt-6 flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 sm:flex-row sm:items-end sm:p-4">
            <label className="block min-w-0 flex-1">
                <span className="mb-1 block text-xs font-medium text-muted">
                    {labels.filterSearch}
                </span>
                <input
                    type="search"
                    name="q"
                    value={searchText}
                    placeholder={labels.usersSearchPlaceholder}
                    maxLength={100}
                    autoComplete="off"
                    className={fieldClassName}
                    onChange={(event) => {
                        setSearchText(event.target.value);
                    }}
                />
            </label>

            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                    type="checkbox"
                    name="guests"
                    checked={filters.guests}
                    className="size-4 shrink-0 cursor-pointer accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    onChange={(event) => {
                        window.location.assign(
                            buildAdminUserListHref(locale, {
                                ...filters,
                                q: searchText.trim().slice(0, 100),
                                guests: event.target.checked,
                                page: 1,
                            }),
                        );
                    }}
                />
                {labels.usersShowGuests}
            </label>
        </div>
    );
}
