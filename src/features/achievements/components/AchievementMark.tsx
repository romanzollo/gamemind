import { ACHIEVEMENT_ILLUSTRATIONS } from '@/features/achievements/illustrations';
import {
    ACHIEVEMENT_TIER,
    type AchievementCode,
    type AchievementTier,
} from '@/features/achievements/types';

/**
 * Визуальный mark бейджа из illustration pack.
 *
 * unlocked → цвет уровня редкости (токены `--tier-*`, светлая/тёмная тема);
 * locked → силуэт: muted + opacity, уровень читается по рамке плитки.
 * lg — плитка профиля; sm — тост (Sonner).
 */

type AchievementMarkProps = {
    code: AchievementCode;
    unlocked: boolean;
    size?: 'sm' | 'lg';
    className?: string;
};

const sizeClassName = {
    sm: 'h-9 w-9',
    /** Профиль: крупнее прежних 40px, чтобы силуэт читался на телефоне. */
    lg: 'h-12 w-12 sm:h-14 sm:w-14',
} as const;

/** Полные строки классов — Tailwind не видит собранные на лету имена. */
export const TIER_TEXT_CLASS_NAME: Record<AchievementTier, string> = {
    bronze: 'text-tier-bronze',
    silver: 'text-tier-silver',
    gold: 'text-tier-gold',
    legend: 'text-tier-legend',
};

export function AchievementMark({
    code,
    unlocked,
    size = 'lg',
    className = '',
}: AchievementMarkProps) {
    const Illustration = ACHIEVEMENT_ILLUSTRATIONS[code];

    return (
        <span
            className={[
                'flex shrink-0 items-center justify-center',
                sizeClassName[size],
                unlocked
                    ? TIER_TEXT_CLASS_NAME[ACHIEVEMENT_TIER[code]]
                    : 'text-muted opacity-55',
                className,
            ]
                .filter(Boolean)
                .join(' ')}
            aria-hidden
        >
            <Illustration className={sizeClassName[size]} />
        </span>
    );
}
