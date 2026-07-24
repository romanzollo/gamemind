'use client';

import { useEffect, useState } from 'react';

import type {
    AdminQuestionListFilters,
    AdminQuestionListStatusFilter,
} from '@/features/admin/lib/parse-admin-question-list-filters';
import {
    buildAdminQuestionListHref,
    hasActiveAdminQuestionListFilters,
} from '@/features/admin/lib/parse-admin-question-list-filters';
import type { Dictionary, Locale } from '@/shared/i18n';
import { buttonClassName } from '@/shared/ui';
import type { Difficulty, QuestionType } from '@/types';

/**
 * Фильтры списка вопросов.
 *
 * Все переходы — hard navigation (`location.assign`), не soft `router.replace`.
 * Soft RSC после list-read в next dev (Windows + Neon) клинил connect
 * (Reset / смена фильтра выглядели как зависание).
 * Поиск — debounce, чтобы не бить Neon на каждый символ.
 */

const fieldClassName =
    'min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60';

const SEARCH_DEBOUNCE_MS = 400;

type AdminQuestionsFiltersProps = {
    locale: Locale;
    labels: Dictionary['admin'];
    difficultyLabels: {
        easy: string;
        medium: string;
        hard: string;
    };
    filters: AdminQuestionListFilters;
};

export function AdminQuestionsFilters({
    locale,
    labels,
    difficultyLabels,
    filters,
}: AdminQuestionsFiltersProps) {
    const [searchText, setSearchText] = useState(filters.q);
    const showReset = hasActiveAdminQuestionListFilters(filters);

    useEffect(() => {
        setSearchText(filters.q);
    }, [filters.q]);

    function navigate(next: AdminQuestionListFilters) {
        window.location.assign(buildAdminQuestionListHref(locale, next));
    }

    function resetFilters() {
        setSearchText('');
        window.location.assign(
            buildAdminQuestionListHref(locale, {
                status: 'all',
                difficulty: 'all',
                type: 'all',
                q: '',
            }),
        );
    }

    useEffect(() => {
        const trimmed = searchText.trim();
        if (trimmed === filters.q) {
            return;
        }

        const timer = setTimeout(() => {
            window.location.assign(
                buildAdminQuestionListHref(locale, {
                    ...filters,
                    q: trimmed.slice(0, 200),
                }),
            );
        }, SEARCH_DEBOUNCE_MS);

        return () => clearTimeout(timer);
    }, [searchText, filters, locale]);

    return (
        <div
            className="mt-6 rounded-lg border border-border bg-surface p-3 sm:p-4"
            aria-label={labels.questionsTitle}
        >
            {/*
              Реальный admin-паттерн: selects равной ширины в одном ряду,
              поиск — отдельная full-width строка (нет «осиротевшего» type на 50%).
            */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <label className="block min-w-0">
                    <span className="mb-1 block text-xs font-medium text-muted">
                        {labels.tableStatus}
                    </span>
                    <select
                        name="status"
                        value={filters.status}
                        className={fieldClassName}
                        onChange={(event) => {
                            navigate({
                                ...filters,
                                status: event.target
                                    .value as AdminQuestionListStatusFilter,
                                q: searchText.trim(),
                            });
                        }}
                    >
                        <option value="all">{labels.filterStatusAll}</option>
                        <option value="active">{labels.statusActive}</option>
                        <option value="inactive">
                            {labels.statusInactive}
                        </option>
                    </select>
                </label>

                <label className="block min-w-0">
                    <span className="mb-1 block text-xs font-medium text-muted">
                        {labels.tableDifficulty}
                    </span>
                    <select
                        name="difficulty"
                        value={filters.difficulty}
                        className={fieldClassName}
                        onChange={(event) => {
                            navigate({
                                ...filters,
                                difficulty: event.target
                                    .value as Difficulty | 'all',
                                q: searchText.trim(),
                            });
                        }}
                    >
                        <option value="all">
                            {labels.filterDifficultyAll}
                        </option>
                        <option value="EASY">{difficultyLabels.easy}</option>
                        <option value="MEDIUM">
                            {difficultyLabels.medium}
                        </option>
                        <option value="HARD">{difficultyLabels.hard}</option>
                    </select>
                </label>

                <label className="block min-w-0">
                    <span className="mb-1 block text-xs font-medium text-muted">
                        {labels.formQuestionType}
                    </span>
                    <select
                        name="type"
                        value={filters.type}
                        className={fieldClassName}
                        onChange={(event) => {
                            navigate({
                                ...filters,
                                type: event.target
                                    .value as QuestionType | 'all',
                                q: searchText.trim(),
                            });
                        }}
                    >
                        <option value="all">{labels.filterTypeAll}</option>
                        <option value="TEXT">
                            {labels.formQuestionTypeText}
                        </option>
                        <option value="IMAGE_GUESS">
                            {labels.formQuestionTypeImageGuess}
                        </option>
                    </select>
                </label>
            </div>

            <label className="mt-3 block min-w-0">
                <span className="mb-1 block text-xs font-medium text-muted">
                    {labels.filterSearch}
                </span>
                <input
                    type="search"
                    name="q"
                    value={searchText}
                    placeholder={labels.filterSearchPlaceholder}
                    maxLength={200}
                    autoComplete="off"
                    className={fieldClassName}
                    onChange={(event) => {
                        setSearchText(event.target.value);
                    }}
                />
            </label>

            {showReset ? (
                <div className="mt-3 flex flex-wrap gap-2">
                    <button
                        type="button"
                        className={buttonClassName({
                            variant: 'secondary',
                            className: 'min-h-10 px-3 text-sm sm:min-h-11',
                        })}
                        onClick={resetFilters}
                    >
                        {labels.filterReset}
                    </button>
                </div>
            ) : null}
        </div>
    );
}
