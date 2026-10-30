/**
 * Achievements на профиле: tile-сетка + illustration pack.
 *
 * Client: тап раскрывает description (паритет desktop title-hover).
 * Mobile: плотнее плитки, locked-first, превью N + «Показать все».
 * Редкость: полоса слева + метка уровня; закрытая плитка — силуэт значка
 * и тот же уровень приглушённо, прогресс — цветом уровня.
 * Только что открытые (`highlightCodes` из `?unlocked=` по ссылке тоста):
 * первыми, метка «Новое», рамка уровня и одна вспышка (motion-safe).
 * Canon: Scoreboard Editorial; DECISIONS → Achievements (unlock flash).
 */
'use client';

import { useState, type CSSProperties } from 'react';

import { AchievementMark } from '@/features/achievements/components/AchievementMark';
import { ACHIEVEMENT_TIER_CLASS_NAMES } from '@/features/achievements/components/achievement-tier-styles';
import { sortAchievementItemsForProfile } from '@/features/achievements/lib/sort-achievement-items';
import {
    ACHIEVEMENT_TIER,
    type AchievementCode,
    type AchievementProgress,
} from '@/features/achievements/types';
import { ProfileListDisclosureControl } from '@/features/profile/components/ProfileListDisclosureControl';
import type { Dictionary } from '@/shared/i18n';
import { InlineAlert } from '@/shared/ui';

/** Сколько бейджей видно на mobile до «Показать все». */
const MOBILE_PREVIEW_COUNT = 6;

type ProfileAchievementsListProps = {
    /** null = Neon/read failed после catch-up. */
    progress: AchievementProgress | null;
    locale: string;
    labels: Dictionary['achievements'];
    /**
     * Коды из `?unlocked=` (уже провалидированы сервером) — подсветить
     * как только что открытые. Только вид: источник правды unlock = БД.
     */
    highlightCodes?: readonly AchievementCode[];
};

function asDate(value: Date | string | null): Date | null {
    if (value == null) {
        return null;
    }

    return value instanceof Date ? value : new Date(value);
}

export function ProfileAchievementsList({
    progress,
    locale,
    labels,
    highlightCodes = [],
}: ProfileAchievementsListProps) {
    const [expandedCode, setExpandedCode] = useState<AchievementCode | null>(
        null,
    );
    const [showAllMobile, setShowAllMobile] = useState(false);

    if (progress === null) {
        return (
            <InlineAlert className="mt-2" tone="warning" role="status">
                {labels.loadFailed}
            </InlineAlert>
        );
    }

    const sortedItems = sortAchievementItemsForProfile(
        progress.items,
        highlightCodes,
    );
    const needsMobileFold = sortedItems.length > MOBILE_PREVIEW_COUNT;

    return (
        <div>
            <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 sm:gap-2">
                {sortedItems.map((item, index) => {
                    const copy = labels.items[item.code];
                    const unlockedAt = asDate(item.unlockedAt);
                    const unlocked = unlockedAt !== null;
                    const unlockedText = unlocked
                        ? unlockedAt.toLocaleDateString(locale, {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                          })
                        : null;

                    const hasCriteria =
                        item.criteriaCurrent !== null &&
                        item.criteriaTarget !== null;
                    const criteriaCurrent = item.criteriaCurrent;
                    const criteriaTarget = item.criteriaTarget;

                    const criteriaText = hasCriteria
                        ? labels.criteriaProgress
                              .replace('{current}', String(criteriaCurrent))
                              .replace('{target}', String(criteriaTarget))
                        : null;

                    const remaining =
                        hasCriteria &&
                        criteriaTarget !== null &&
                        criteriaCurrent !== null
                            ? Math.max(criteriaTarget - criteriaCurrent, 0)
                            : null;

                    const remainingText =
                        !unlocked &&
                        remaining !== null &&
                        criteriaTarget !== null &&
                        criteriaTarget > 1 &&
                        remaining > 0
                            ? labels.criteriaRemaining.replace(
                                  '{remaining}',
                                  String(remaining),
                              )
                            : null;

                    const statusText = unlocked
                        ? labels.unlockedOn.replace(
                              '{date}',
                              unlockedText ?? '',
                          )
                        : (criteriaText ?? labels.locked);

                    const progressPercent =
                        !unlocked &&
                        hasCriteria &&
                        criteriaTarget !== null &&
                        criteriaTarget > 0 &&
                        criteriaCurrent !== null
                            ? Math.min(
                                  100,
                                  Math.round(
                                      (criteriaCurrent / criteriaTarget) * 100,
                                  ),
                              )
                            : null;

                    const tier = ACHIEVEMENT_TIER[item.code];
                    const tierClassName = ACHIEVEMENT_TIER_CLASS_NAMES[tier];
                    const tierName = labels.tiers[tier];
                    // Ссылку можно подделать: «Новое» только если бейдж реально открыт.
                    const isNew =
                        unlocked && highlightCodes.includes(item.code);

                    const isExpanded = expandedCode === item.code;
                    const hideOnMobilePreview =
                        needsMobileFold &&
                        !showAllMobile &&
                        index >= MOBILE_PREVIEW_COUNT;

                    return (
                        <li
                            key={item.code}
                            className={
                                hideOnMobilePreview ? 'max-lg:hidden' : undefined
                            }
                        >
                            <button
                                type="button"
                                title={copy.description}
                                aria-expanded={isExpanded}
                                onClick={() =>
                                    setExpandedCode((current) =>
                                        current === item.code
                                            ? null
                                            : item.code,
                                    )
                                }
                                className={[
                                    'flex w-full gap-2.5 border border-border border-l-4 p-2 text-left sm:gap-3 sm:p-2.5',
                                    unlocked
                                        ? `${tierClassName.stripe} bg-surface`
                                        : `${tierClassName.stripeLocked} bg-surface/70 opacity-80`,
                                    isNew
                                        ? `${tierClassName.ring} motion-safe:animate-[gm-achievement-glow_1.6s_ease-out_300ms_both]`
                                        : '',
                                ]
                                    .filter(Boolean)
                                    .join(' ')}
                                style={
                                    isNew
                                        ? ({
                                              '--gm-glow': tierClassName.glow,
                                          } as CSSProperties)
                                        : undefined
                                }
                            >
                                <AchievementMark
                                    code={item.code}
                                    unlocked={unlocked}
                                    size="lg"
                                />

                                <div className="min-w-0 flex-1 self-center">
                                    {/* Цвет плашки не озвучивается — полное «Редкость: …» для читалок. */}
                                    <p className="leading-none">
                                        <span className="sr-only">
                                            {labels.tierLabel.replace(
                                                '{tier}',
                                                tierName,
                                            )}
                                        </span>
                                        <span
                                            aria-hidden
                                            className={`inline-flex rounded-sm px-1.5 py-px font-mono text-[10px] font-semibold uppercase tracking-wide ${tierClassName.chip}`}
                                        >
                                            {tierName}
                                        </span>
                                        {isNew ? (
                                            <span className="ml-1.5 inline-flex rounded-sm bg-primary px-1.5 py-px font-mono text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                                                {labels.newBadge}
                                            </span>
                                        ) : null}
                                    </p>
                                    <p className="mt-1 font-display text-sm font-semibold leading-tight tracking-tight text-foreground">
                                        {copy.title}
                                    </p>
                                    <p className="mt-0.5 font-mono text-xs leading-tight tabular-nums tracking-tight text-muted">
                                        {unlocked && unlockedAt ? (
                                            <time
                                                dateTime={unlockedAt.toISOString()}
                                            >
                                                {statusText}
                                            </time>
                                        ) : (
                                            <>
                                                <span>{statusText}</span>
                                                {remainingText ? (
                                                    <span className="mt-0.5 block font-sans text-[11px] normal-case tracking-normal text-muted sm:inline sm:mt-0 sm:before:content-['·_']">
                                                        {remainingText}
                                                    </span>
                                                ) : null}
                                            </>
                                        )}
                                    </p>
                                    {progressPercent !== null ? (
                                        <div
                                            className="mt-1.5 h-1 w-full rounded-full bg-border"
                                            role="progressbar"
                                            aria-valuemin={0}
                                            aria-valuemax={
                                                criteriaTarget ?? 0
                                            }
                                            aria-valuenow={
                                                criteriaCurrent ?? 0
                                            }
                                            aria-label={copy.title}
                                        >
                                            <div
                                                className={`h-full rounded-full ${tierClassName.bar}`}
                                                style={{
                                                    width: `${progressPercent}%`,
                                                }}
                                            />
                                        </div>
                                    ) : null}
                                    {isExpanded ? (
                                        <p className="mt-1.5 text-xs leading-snug text-muted">
                                            {copy.description}
                                        </p>
                                    ) : (
                                        <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-muted/80 sm:hidden">
                                            {labels.tapHint} ›
                                        </p>
                                    )}
                                </div>
                            </button>
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
                        className="lg:hidden"
                    />
                ) : (
                    <ProfileListDisclosureControl
                        kind="expand"
                        label={labels.showAll.replace(
                            '{count}',
                            String(sortedItems.length),
                        )}
                        onExpand={() => setShowAllMobile(true)}
                        className="lg:hidden"
                    />
                )
            ) : null}
        </div>
    );
}
