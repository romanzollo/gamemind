/**
 * Классы уровня редкости для значка, плитки профиля и unlock-тоста.
 *
 * Полными строками: Tailwind видит только литералы в исходниках, собранные
 * на лету `text-tier-${tier}` в CSS не попадут. Цвета — токены `--tier-*`
 * и `--podium-*` из globals.css (светлая/тёмная тема).
 * Canon: docs/DECISIONS.md → Achievements (tiers).
 */

import type { AchievementTier } from '@/features/achievements/types';

export type AchievementTierClassNames = {
    /** Цвет открытого значка. */
    text: string;
    /** Полоса слева у открытой плитки / тоста. */
    stripe: string;
    /** Та же полоса приглушённо — закрытая плитка («что на кону»). */
    stripeLocked: string;
    /** Метка уровня (плашка как у медалей рейтинга). */
    chip: string;
    /** Заливка полосы прогресса. */
    bar: string;
    /** Статичная рамка новой плитки (видна и при reduced-motion). */
    ring: string;
    /** Значение для `--gm-glow` — цвет вспышки новой плитки. */
    glow: string;
};

export const ACHIEVEMENT_TIER_CLASS_NAMES: Record<
    AchievementTier,
    AchievementTierClassNames
> = {
    bronze: {
        text: 'text-tier-bronze',
        stripe: 'border-l-tier-bronze',
        stripeLocked: 'border-l-tier-bronze/45',
        chip: 'bg-podium-bronze text-podium-bronze-fg',
        bar: 'bg-tier-bronze',
        ring: 'ring-2 ring-tier-bronze',
        glow: 'var(--tier-bronze)',
    },
    silver: {
        text: 'text-tier-silver',
        stripe: 'border-l-tier-silver',
        stripeLocked: 'border-l-tier-silver/45',
        chip: 'bg-podium-silver text-podium-silver-fg',
        bar: 'bg-tier-silver',
        ring: 'ring-2 ring-tier-silver',
        glow: 'var(--tier-silver)',
    },
    gold: {
        text: 'text-tier-gold',
        stripe: 'border-l-tier-gold',
        stripeLocked: 'border-l-tier-gold/45',
        chip: 'bg-podium-gold text-podium-gold-fg',
        bar: 'bg-tier-gold',
        ring: 'ring-2 ring-tier-gold',
        glow: 'var(--tier-gold)',
    },
    legend: {
        text: 'text-tier-legend',
        stripe: 'border-l-tier-legend',
        stripeLocked: 'border-l-tier-legend/45',
        chip: 'bg-podium-legend text-podium-legend-fg',
        bar: 'bg-tier-legend',
        ring: 'ring-2 ring-tier-legend',
        glow: 'var(--tier-legend)',
    },
};
