/**
 * Achievements на профиле: tile-сетка + illustration pack.
 *
 * Client: тап раскрывает description (паритет desktop title-hover).
 * Mobile: плотнее плитки, locked-first, превью N + «Показать все».
 * Редкость: полоса слева + метка уровня; закрытая плитка — силуэт значка
 * и тот же уровень приглушённо, прогресс — цветом уровня.
 * Canon: Scoreboard Editorial.
 */
'use client';

import { useState } from 'react';

import { AchievementMark } from '@/features/achievements/components/AchievementMark';
import {
    ACHIEVEMENT_TIER,
    type AchievementCode,
    type AchievementProgress,
    type AchievementProgressItem,
    type AchievementTier,
} from '@/features/achievements/types';
import { ProfileListDisclosureControl } from '@/features/profile/components/ProfileListDisclosureControl';
import type { Dictionary } from '@/shared/i18n';
import { InlineAlert } from '@/shared/ui';

/** Сколько бейджей видно на mobile до «Показать все». */
const MOBILE_PREVIEW_COUNT = 6;

/**
 * Классы уровня редкости — полными строками (Tailwind не видит собранные).
 * Закрытая плитка показывает тот же уровень приглушённо: видно, что на кону.
 */
const TIER_TILE_CLASS_NAME: Record<
    AchievementTier,
    { stripe: string; stripeLocked: string; chip: string; bar: string }
> = {
    bronze: {
        stripe: 'border-l-tier-bronze',
        stripeLocked: 'border-l-tier-bronze/45',
        chip: 'bg-podium-bronze text-podium-bronze-fg',
        bar: 'bg-tier-bronze',
    },
    silver: {
        stripe: 'border-l-tier-silver',
        stripeLocked: 'border-l-tier-silver/45',
        chip: 'bg-podium-silver text-podium-silver-fg',
        bar: 'bg-tier-silver',
    },
    gold: {
        stripe: 'border-l-tier-gold',
        stripeLocked: 'border-l-tier-gold/45',
        chip: 'bg-podium-gold text-podium-gold-fg',
        bar: 'bg-tier-gold',
    },
    legend: {
        stripe: 'border-l-tier-legend',
        stripeLocked: 'border-l-tier-legend/45',
        chip: 'bg-podium-legend text-podium-legend-fg',
        bar: 'bg-tier-legend',
    },
};

type ProfileAchievementsListProps = {
    /** null = Neon/read failed после catch-up. */
    progress: AchievementProgress | null;
    locale: string;
    labels: Dictionary['achievements'];
};

function asDate(value: Date | string | null): Date | null {
    if (value == null) {
        return null;
    }

    return value instanceof Date ? value : new Date(value);
}

function isUnlocked(item: AchievementProgressItem): boolean {
    return asDate(item.unlockedAt) !== null;
}

/**
 * Locked сначала (мотивация), внутри группы — порядок каталога.
 */
function sortLockedFirst(
    items: AchievementProgressItem[],
): AchievementProgressItem[] {
    return [...items].sort((a, b) => {
        const aOpen = isUnlocked(a) ? 1 : 0;
        const bOpen = isUnlocked(b) ? 1 : 0;
        return aOpen - bOpen;
    });
}

export function ProfileAchievementsList({
    progress,
    locale,
    labels,
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

    const sortedItems = sortLockedFirst(progress.items);
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
                    const tierClassName = TIER_TILE_CLASS_NAME[tier];
                    const tierName = labels.tiers[tier];

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
                                ].join(' ')}
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
