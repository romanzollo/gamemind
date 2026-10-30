import { ACHIEVEMENT_TIER_CLASS_NAMES } from '@/features/achievements/components/achievement-tier-styles';
import { ACHIEVEMENT_ILLUSTRATIONS } from '@/features/achievements/illustrations';
import {
    ACHIEVEMENT_TIER,
    type AchievementCode,
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
                    ? ACHIEVEMENT_TIER_CLASS_NAMES[ACHIEVEMENT_TIER[code]].text
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
