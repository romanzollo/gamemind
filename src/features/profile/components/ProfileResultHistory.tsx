/**
 * История результатов профиля: Scoreboard Editorial.
 *
 * Узкий экран (&lt;640px): scoreboard-stack + превью N строк + disclosure
 * (Показать все / Свернуть секцию — как ачивки).
 * Шире — таблица целиком.
 * У каждой игры — чип режима (Классика, Блиц, Выживание, Челлендж дня,
 * Вызов) и подпись «сложность · тема / волна». Над списком — чипы-фильтр
 * по режимам, которые есть среди загруженных игр (в браузере, без запроса). «Верно» зелёным — только у
 * идеальной партии: зелёный в дизайн-системе значит «верно».
 * Presentation only — без изменений scoring / snapshot.
 */
'use client';

import Link from 'next/link';
import { useState } from 'react';

import { getSessionDifficultyLabel } from '@/features/quiz/lib/session-difficulty-label';
import { ChipRadioGroup } from '@/shared/ui/chip-radio-group';
import { ProfileListDisclosureControl } from '@/features/profile/components/ProfileListDisclosureControl';
import type { Dictionary } from '@/shared/i18n';
import { EmptyState } from '@/shared/ui';

import type {
    ProfileGameMode,
    ProfileResultHistoryEntry,
} from '../types/result-history-entry';

/** Сколько строк истории видно на mobile до «Показать все». */
const MOBILE_PREVIEW_COUNT = 5;

type ProfileResultHistoryProps = {
    entries: ProfileResultHistoryEntry[];
    locale: string;
    labels: Dictionary['profile'];
    difficultyLabels: Pick<
        Dictionary['quiz'],
        'easy' | 'medium' | 'hard' | 'mixed'
    >;
    /** Названия режимов — из словарей режимов (одно слово на весь сайт). */
    modeLabels: Record<ProfileGameMode, string>;
    /** Чип «Все» фильтра. */
    allLabel: string;
};

type ModeFilter = ProfileGameMode | 'all';

/** Порядок чипов фильтра — как режимы на главной. */
const MODE_ORDER: readonly ProfileGameMode[] = [
    'classic',
    'blitz',
    'survival',
    'daily',
    'challenge',
];

function asDate(value: Date | string): Date {
    return value instanceof Date ? value : new Date(value);
}

/** «Легко · 2010-е» / «Легко · волна 2» — рядом с чипом режима. */
function detailLine(
    entry: ProfileResultHistoryEntry,
    locale: string,
    labels: ProfileResultHistoryProps['labels'],
    difficultyLabels: ProfileResultHistoryProps['difficultyLabels'],
): string {
    const parts = [getSessionDifficultyLabel(entry.difficulty, difficultyLabels)];

    if (entry.topic) {
        parts.push(locale === 'en' ? entry.topic.nameEn : entry.topic.nameRu);
    }
    if (entry.mode === 'survival' && entry.waveIndex != null) {
        parts.push(labels.historyWave.replace('{n}', String(entry.waveIndex)));
    }

    return parts.join(' · ');
}

/** Чип режима: нейтральный; Челлендж дня — в тон бренда (главный режим дня). */
function ModeChip({ mode, label }: { mode: ProfileGameMode; label: string }) {
    return (
        <span
            className={`inline-flex shrink-0 items-center rounded-sm px-2 py-0.5 text-2xs font-semibold tracking-wide ${
                mode === 'daily'
                    ? 'bg-primary/10 text-primary'
                    : 'bg-surface-muted text-foreground'
            }`}
        >
            {label}
        </span>
    );
}

/** Зелёный — только у партии без ошибок. */
function correctToneClass(entry: ProfileResultHistoryEntry): string {
    return entry.totalQuestions > 0 && entry.correctCount === entry.totalQuestions
        ? 'text-success'
        : 'text-foreground';
}

function formatCorrect(
    correctCount: number,
    totalQuestions: number,
    ofWord: string,
) {
    return `${correctCount} ${ofWord} ${totalQuestions}`;
}

/** Info blue — отделяет действие «Обзор» от success/primary teal. */
const reviewLinkClassName =
    'text-info underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

const phoneRowClassName =
    'block px-3 py-3.5 motion-safe:transition-colors hover:bg-surface-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export function ProfileResultHistory({
    entries: allEntries,
    locale,
    labels,
    difficultyLabels,
    modeLabels,
    allLabel,
}: ProfileResultHistoryProps) {
    const [showAllMobile, setShowAllMobile] = useState(false);
    const [modeFilter, setModeFilter] = useState<ModeFilter>('all');

    if (allEntries.length === 0) {
        return (
            <EmptyState className="mt-4" title={labels.historyEmpty} />
        );
    }

    const presentModes = MODE_ORDER.filter((mode) =>
        allEntries.some((entry) => entry.mode === mode),
    );
    const entries =
        modeFilter === 'all'
            ? allEntries
            : allEntries.filter((entry) => entry.mode === modeFilter);
    const needsMobileFold = entries.length > MOBILE_PREVIEW_COUNT;

    return (
        <div>
            {/* Фильтр нужен, только когда режимов больше одного. */}
            {presentModes.length > 1 ? (
                <div className="mb-3" data-testid="history-mode-filter">
                    <ChipRadioGroup<ModeFilter>
                        name="history-mode"
                        legend={labels.historyMode}
                        hideLegend
                        value={modeFilter}
                        onChange={(value) => {
                            setModeFilter(value);
                            setShowAllMobile(false);
                        }}
                        options={[
                            { value: 'all', label: allLabel },
                            ...presentModes.map((mode) => ({
                                value: mode,
                                label: modeLabels[mode],
                            })),
                        ]}
                    />
                </div>
            ) : null}
            {/*
              Phone / узкий tablet (&lt;640px): scoreboard-stack + disclosure.
              640px+: таблица целиком.
            */}
            <ul className="divide-y divide-border sm:hidden">
                {entries.map((entry, index) => {
                    const completedAt = asDate(entry.completedAt);
                    const detail = detailLine(
                        entry,
                        locale,
                        labels,
                        difficultyLabels,
                    );
                    const href = `/${locale}/result/${entry.sessionId}`;
                    const correctText = formatCorrect(
                        entry.correctCount,
                        entry.totalQuestions,
                        labels.historyOf,
                    );
                    const hideOnMobilePreview =
                        needsMobileFold &&
                        !showAllMobile &&
                        index >= MOBILE_PREVIEW_COUNT;

                    return (
                        <li
                            key={entry.sessionId}
                            className={
                                hideOnMobilePreview
                                    ? 'max-sm:hidden'
                                    : undefined
                            }
                        >
                            <Link
                                href={href}
                                prefetch={false}
                                className={phoneRowClassName}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                                        <ModeChip
                                            mode={entry.mode}
                                            label={modeLabels[entry.mode]}
                                        />
                                        <span className="text-xs text-muted">
                                            {detail}
                                        </span>
                                        <time
                                            dateTime={completedAt.toISOString()}
                                            className="shrink-0 font-mono text-xs tabular-nums text-muted"
                                        >
                                            {completedAt.toLocaleDateString(
                                                locale,
                                            )}
                                        </time>
                                    </div>
                                    <span
                                        className={`${reviewLinkClassName} shrink-0 text-sm font-medium`}
                                    >
                                        {labels.historyView}
                                    </span>
                                </div>

                                <div className="mt-3 grid grid-cols-2 gap-4">
                                    <p>
                                        <span className="block text-2xs font-medium uppercase tracking-wide text-muted">
                                            {labels.historyScore}
                                        </span>
                                        <span className="mt-0.5 block font-display text-2xl font-semibold tabular-nums tracking-wide text-foreground">
                                            {entry.score}
                                        </span>
                                    </p>
                                    <p>
                                        <span className="block text-2xs font-medium uppercase tracking-wide text-muted">
                                            {labels.historyCorrect}
                                        </span>
                                        <span
                                            className={`mt-0.5 block font-display text-2xl font-semibold tabular-nums tracking-wide ${correctToneClass(entry)}`}
                                        >
                                            {correctText}
                                        </span>
                                    </p>
                                </div>
                            </Link>
                        </li>
                    );
                })}
            </ul>

            {needsMobileFold ? (
                showAllMobile ? (
                    <ProfileListDisclosureControl
                        kind="collapse"
                        label={labels.collapseSection}
                        onCollapse={() => setShowAllMobile(false)}
                        className="sm:hidden"
                    />
                ) : (
                    <ProfileListDisclosureControl
                        kind="expand"
                        label={labels.showAll.replace(
                            '{count}',
                            String(entries.length),
                        )}
                        onExpand={() => setShowAllMobile(true)}
                        className="sm:hidden"
                    />
                )
            ) : null}

            <div className="hidden overflow-x-auto sm:block">
                <table className="w-full border-collapse text-left text-sm">
                    <thead>
                        <tr className="border-b border-border bg-surface-muted/60 text-2xs font-medium uppercase tracking-wide text-muted">
                            <th className="whitespace-nowrap py-2.5 pl-3 pr-3 sm:pr-4">
                                {labels.historyDate}
                            </th>
                            <th className="whitespace-nowrap py-2.5 pr-3 sm:pr-4">
                                {labels.historyMode}
                            </th>
                            <th className="whitespace-nowrap py-2.5 pr-3 sm:pr-4">
                                {labels.historyScore}
                            </th>
                            <th className="whitespace-nowrap py-2.5 pr-3 sm:pr-4">
                                {labels.historyCorrect}
                            </th>
                            <th className="whitespace-nowrap py-2.5 pr-3 font-medium sm:pr-4">
                                {labels.historyView}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {entries.map((entry) => {
                            const completedAt = asDate(entry.completedAt);

                            return (
                                <tr
                                    key={entry.sessionId}
                                    className="border-b border-border motion-safe:transition-colors hover:bg-surface-muted/40"
                                >
                                    <td className="whitespace-nowrap py-3 pl-3 pr-3 font-mono text-xs tabular-nums text-muted sm:pr-4">
                                        {completedAt.toLocaleDateString(
                                            locale,
                                        )}
                                    </td>
                                    <td className="whitespace-nowrap py-3 pr-3 sm:pr-4">
                                        <ModeChip
                                            mode={entry.mode}
                                            label={modeLabels[entry.mode]}
                                        />
                                        <span className="ml-2 text-xs text-muted">
                                            {detailLine(
                                                entry,
                                                locale,
                                                labels,
                                                difficultyLabels,
                                            )}
                                        </span>
                                    </td>
                                    <td className="whitespace-nowrap py-3 pr-3 font-display text-base font-semibold tabular-nums tracking-wide text-foreground sm:pr-4">
                                        {entry.score}
                                    </td>
                                    <td
                                        className={`whitespace-nowrap py-3 pr-3 font-display text-base font-semibold tabular-nums tracking-wide sm:pr-4 ${correctToneClass(entry)}`}
                                    >
                                        {formatCorrect(
                                            entry.correctCount,
                                            entry.totalQuestions,
                                            labels.historyOf,
                                        )}
                                    </td>
                                    <td className="whitespace-nowrap py-3">
                                        <Link
                                            href={`/${locale}/result/${entry.sessionId}`}
                                            prefetch={false}
                                            className={`${reviewLinkClassName} font-medium`}
                                        >
                                            {labels.historyView}
                                        </Link>
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
