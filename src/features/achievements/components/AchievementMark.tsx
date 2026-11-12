import { ACHIEVEMENT_GLYPHS } from '@/features/achievements/components/achievement-glyphs';
import { ACHIEVEMENT_TIER_CLASS_NAMES } from '@/features/achievements/components/achievement-tier-styles';
import {
    ACHIEVEMENT_TIER,
    type AchievementCode,
    type AchievementTier,
} from '@/features/achievements/types';

/**
 * Жетон достижения (ADR «Achievement tokens»): скруглённая рамка в цвет
 * редкости с лёгкой заливкой, знак категории внутри, внизу четыре клетки —
 * сколько горит, такая редкость (1 бронза … 4 легенда). Редкость читается
 * и без цвета (DESIGN.md: статус не только цветом), клетки — язык знака
 * GameMind.
 *
 * Открыто → цвет уровня (токены `--tier-*`, обе темы через currentColor).
 * Закрыто → силуэт: пунктирная рамка, muted, клетки редкости приглушены, но
 * видны — «что на кону».
 * lg — плитка профиля; sm — тост.
 */

type AchievementMarkProps = {
    code: AchievementCode;
    unlocked: boolean;
    size?: 'sm' | 'lg';
    className?: string;
};

const sizeClassName = {
    sm: 'h-9 w-9',
    lg: 'h-12 w-12 sm:h-14 sm:w-14',
} as const;

const TIER_CELLS: Record<AchievementTier, number> = {
    bronze: 1,
    silver: 2,
    gold: 3,
    legend: 4,
};

export function AchievementMark({
    code,
    unlocked,
    size = 'lg',
    className = '',
}: AchievementMarkProps) {
    const tier = ACHIEVEMENT_TIER[code];
    const litCells = TIER_CELLS[tier];

    return (
        <span
            className={[
                'flex shrink-0 items-center justify-center',
                sizeClassName[size],
                unlocked ? ACHIEVEMENT_TIER_CLASS_NAMES[tier].text : 'text-muted',
                className,
            ]
                .filter(Boolean)
                .join(' ')}
            aria-hidden
        >
            <svg viewBox="0 0 32 32" className={sizeClassName[size]}>
                <rect
                    x="2.5"
                    y="1.5"
                    width="27"
                    height="29"
                    rx="6"
                    fill={unlocked ? 'currentColor' : 'none'}
                    fillOpacity={unlocked ? 0.12 : undefined}
                    stroke="currentColor"
                    strokeWidth={unlocked ? 1.6 : 1}
                    strokeDasharray={unlocked ? undefined : '2.2 1.6'}
                />
                <g transform="translate(0 -1.2)">{ACHIEVEMENT_GLYPHS[code]}</g>
                {[0, 1, 2, 3].map((i) => (
                    <rect
                        key={i}
                        x={8.6 + i * 4}
                        y="25"
                        width="2.8"
                        height="2.8"
                        rx="0.7"
                        fill={i < litCells ? 'currentColor' : 'none'}
                        fillOpacity={i < litCells && !unlocked ? 0.55 : undefined}
                        stroke="currentColor"
                        strokeWidth="0.6"
                    />
                ))}
            </svg>
        </span>
    );
}
