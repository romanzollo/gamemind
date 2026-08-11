import { ACHIEVEMENT_ILLUSTRATIONS } from '@/features/achievements/illustrations';
import type { AchievementCode } from '@/features/achievements/types';

/**
 * Визуальный mark бейджа из illustration pack.
 *
 * unlocked → primary; locked → muted + легкая desaturation через opacity.
 * Размер md — для tile-сетки; sm — запасной компактный ряд.
 */

type AchievementMarkProps = {
    code: AchievementCode;
    unlocked: boolean;
    size?: 'sm' | 'md';
    className?: string;
};

const sizeShellClassName = {
    sm: 'h-9 w-9',
    /** Mobile плотнее; sm+ чуть крупнее для tile-сетки. */
    md: 'h-10 w-10 sm:h-12 sm:w-12',
} as const;

const sizeSvgClassName = {
    sm: 'h-9 w-9',
    md: 'h-10 w-10 sm:h-12 sm:w-12',
} as const;

export function AchievementMark({
    code,
    unlocked,
    size = 'md',
    className = '',
}: AchievementMarkProps) {
    const Illustration = ACHIEVEMENT_ILLUSTRATIONS[code];

    return (
        <span
            className={[
                'flex shrink-0 items-center justify-center',
                sizeShellClassName[size],
                unlocked ? 'text-primary' : 'text-muted opacity-55',
                className,
            ]
                .filter(Boolean)
                .join(' ')}
            aria-hidden
        >
            <Illustration className={sizeSvgClassName[size]} />
        </span>
    );
}
