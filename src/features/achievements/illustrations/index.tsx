/**
 * Мини illustration pack Achievements MVP (Scoreboard Editorial).
 *
 * Зачем не PNG/emoji/Lucide:
 * - единый стиль с токенами (currentColor + fill opacity);
 * - light/dark без отдельных ассетов;
 * - новый бейдж = новый SVG рядом + запись в ILLUSTRATION_BY_CODE.
 *
 * Файлы здесь = «pack»; UI тянет через AchievementMark.
 */

import type { ReactNode } from 'react';

import type { AchievementCode } from '@/features/achievements/types';

type IllustrationProps = {
    className?: string;
};

function Plaque({
    className = '',
    children,
}: {
    className?: string;
    children: ReactNode;
}) {
    return (
        <svg
            viewBox="0 0 48 48"
            className={className}
            fill="none"
            aria-hidden
        >
            {/* Подложка plaque */}
            <rect
                x="3"
                y="3"
                width="42"
                height="42"
                className="fill-current opacity-[0.08]"
            />
            <rect
                x="3"
                y="3"
                width="42"
                height="42"
                stroke="currentColor"
                strokeWidth="1.5"
                className="opacity-40"
            />
            {children}
        </svg>
    );
}

/** Старт: флаг на шесте */
export function FirstQuizIllustration({ className }: IllustrationProps) {
    return (
        <Plaque className={className}>
            <path
                d="M14 38V12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="square"
            />
            <path
                d="M14 12h18l-3.5 5.5L32 23H14V12Z"
                className="fill-current opacity-90"
            />
            <path
                d="M10 38h12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="square"
            />
        </Plaque>
    );
}

/** Прогресс: пять ступеней */
export function Quizzes5Illustration({ className }: IllustrationProps) {
    return (
        <Plaque className={className}>
            <rect x="9" y="30" width="5" height="8" className="fill-current opacity-35" />
            <rect x="16" y="25" width="5" height="13" className="fill-current opacity-50" />
            <rect x="23" y="19" width="5" height="19" className="fill-current opacity-70" />
            <rect x="30" y="14" width="5" height="24" className="fill-current opacity-85" />
            <rect x="37" y="10" width="5" height="28" className="fill-current" />
        </Plaque>
    );
}

/** Прогресс ×2: двойная лестница ступеней */
export function Quizzes10Illustration({ className }: IllustrationProps) {
    return (
        <Plaque className={className}>
            <rect x="8" y="28" width="4" height="10" className="fill-current opacity-30" />
            <rect x="13" y="24" width="4" height="14" className="fill-current opacity-45" />
            <rect x="18" y="19" width="4" height="19" className="fill-current opacity-60" />
            <rect x="23" y="15" width="4" height="23" className="fill-current opacity-75" />
            <rect x="28" y="11" width="4" height="27" className="fill-current opacity-90" />
            <rect x="35" y="22" width="4" height="16" className="fill-current opacity-40" />
            <rect x="40" y="16" width="4" height="22" className="fill-current" />
        </Plaque>
    );
}

/** Идеал: ромб-медаль с галочкой */
export function PerfectQuizIllustration({ className }: IllustrationProps) {
    return (
        <Plaque className={className}>
            <path
                d="M24 8l12 12-12 12L12 20 24 8Z"
                className="fill-current opacity-20"
                stroke="currentColor"
                strokeWidth="1.75"
            />
            <path
                d="M17.5 20.5l4 4 8.5-8.5"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="square"
                strokeLinejoin="miter"
            />
        </Plaque>
    );
}

/** Daily: календарь с акцентом «день» */
export function DailyCompleteIllustration({ className }: IllustrationProps) {
    return (
        <Plaque className={className}>
            <rect
                x="11"
                y="14"
                width="26"
                height="22"
                className="fill-current opacity-15"
                stroke="currentColor"
                strokeWidth="1.75"
            />
            <path
                d="M11 20h26"
                stroke="currentColor"
                strokeWidth="1.75"
            />
            <path
                d="M17 11v6M31 11v6"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="square"
            />
            <circle cx="24" cy="28" r="3.5" className="fill-current" />
        </Plaque>
    );
}

/** Medium: холм перед пиком */
export function MediumQuizIllustration({ className }: IllustrationProps) {
    return (
        <Plaque className={className}>
            <path
                d="M8 36h32"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="square"
            />
            <path
                d="M10 36c4-10 8-16 14-16s10 6 14 16H10Z"
                className="fill-current opacity-25"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinejoin="miter"
            />
            <path
                d="M18 28h12"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="square"
                className="opacity-70"
            />
        </Plaque>
    );
}

/** Hard: горный пик */
export function HardQuizIllustration({ className }: IllustrationProps) {
    return (
        <Plaque className={className}>
            <path
                d="M8 36h32"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="square"
            />
            <path
                d="M10 36l10-20 5 10 4-7 9 17H10Z"
                className="fill-current opacity-25"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinejoin="miter"
            />
            <path
                d="M20 16l3 6"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="square"
            />
        </Plaque>
    );
}

/** Объём 25: плотная лестница + акцент верхней ступени */
export function Quizzes25Illustration({ className }: IllustrationProps) {
    return (
        <Plaque className={className}>
            <rect x="8" y="32" width="4" height="6" className="fill-current opacity-25" />
            <rect x="13" y="28" width="4" height="10" className="fill-current opacity-40" />
            <rect x="18" y="24" width="4" height="14" className="fill-current opacity-55" />
            <rect x="23" y="19" width="4" height="19" className="fill-current opacity-70" />
            <rect x="28" y="14" width="4" height="24" className="fill-current opacity-85" />
            <rect x="34" y="10" width="6" height="28" className="fill-current" />
        </Plaque>
    );
}

/** Объём 50: широкая «стена» прогресса */
export function Quizzes50Illustration({ className }: IllustrationProps) {
    return (
        <Plaque className={className}>
            <rect x="9" y="30" width="30" height="8" className="fill-current opacity-20" />
            <rect x="9" y="22" width="24" height="8" className="fill-current opacity-40" />
            <rect x="9" y="14" width="18" height="8" className="fill-current opacity-65" />
            <rect x="9" y="10" width="12" height="4" className="fill-current" />
        </Plaque>
    );
}

/** Три идеальных: три ромба */
export function Perfect3Illustration({ className }: IllustrationProps) {
    return (
        <Plaque className={className}>
            <path
                d="M14 22l5 5-5 5-5-5 5-5Z"
                className="fill-current opacity-35"
                stroke="currentColor"
                strokeWidth="1.5"
            />
            <path
                d="M24 14l5 5-5 5-5-5 5-5Z"
                className="fill-current opacity-55"
                stroke="currentColor"
                strokeWidth="1.5"
            />
            <path
                d="M34 22l5 5-5 5-5-5 5-5Z"
                className="fill-current opacity-90"
                stroke="currentColor"
                strokeWidth="1.5"
            />
        </Plaque>
    );
}

/** Три Daily: три точки в календаре */
export function Daily3Illustration({ className }: IllustrationProps) {
    return (
        <Plaque className={className}>
            <rect
                x="11"
                y="14"
                width="26"
                height="22"
                className="fill-current opacity-15"
                stroke="currentColor"
                strokeWidth="1.75"
            />
            <path d="M11 20h26" stroke="currentColor" strokeWidth="1.75" />
            <path
                d="M17 11v6M31 11v6"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="square"
            />
            <circle cx="17" cy="28" r="2.5" className="fill-current opacity-50" />
            <circle cx="24" cy="28" r="2.5" className="fill-current opacity-75" />
            <circle cx="31" cy="28" r="2.5" className="fill-current" />
        </Plaque>
    );
}

/** Timed/Blitz: песочные часы */
export function TimedCompleteIllustration({ className }: IllustrationProps) {
    return (
        <Plaque className={className}>
            <path
                d="M16 12h16v4L28 24l4 8v4H16v-4l4-8-4-8v-4Z"
                className="fill-current opacity-15"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinejoin="miter"
            />
            <path
                d="M20 16h8M20 32h8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="square"
                className="opacity-70"
            />
            <path
                d="M24 24h0.01"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="square"
            />
        </Plaque>
    );
}

/** Classic + Timed: две полосы темпа */
export function ClassicAndTimedIllustration({ className }: IllustrationProps) {
    return (
        <Plaque className={className}>
            <path
                d="M12 18h24"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="square"
                className="opacity-45"
            />
            <path
                d="M12 30h16"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="square"
            />
            <circle cx="36" cy="30" r="3" className="fill-current" />
        </Plaque>
    );
}

/** 90% accuracy: дуга почти полного круга */
export function HighAccuracy90Illustration({ className }: IllustrationProps) {
    return (
        <Plaque className={className}>
            <circle
                cx="24"
                cy="24"
                r="12"
                className="fill-current opacity-10"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeDasharray="68 8"
                strokeLinecap="square"
            />
            <path
                d="M24 16v8l5 3"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="square"
                strokeLinejoin="miter"
            />
        </Plaque>
    );
}

/** Очки: табло с чертой */
export function Points250Illustration({ className }: IllustrationProps) {
    return (
        <Plaque className={className}>
            <rect
                x="10"
                y="14"
                width="28"
                height="20"
                className="fill-current opacity-12"
                stroke="currentColor"
                strokeWidth="1.75"
            />
            <path
                d="M16 24h16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="square"
            />
            <path
                d="M18 20h4M26 20h4M18 28h4M26 28h4"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="square"
                className="opacity-60"
            />
        </Plaque>
    );
}

/** Пять medium: пять коротких холмов */
export function Medium5Illustration({ className }: IllustrationProps) {
    return (
        <Plaque className={className}>
            <path
                d="M8 34h32"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="square"
            />
            <path
                d="M9 34c2-6 4-9 6-9s4 3 6 9H9Z"
                className="fill-current opacity-30"
            />
            <path
                d="M17 34c2-7 4-11 6-11s4 4 6 11H17Z"
                className="fill-current opacity-45"
            />
            <path
                d="M25 34c2-8 4-12 6-12s4 4 6 12H25Z"
                className="fill-current opacity-70"
            />
            <path
                d="M33 34c1.5-5 3-8 4.5-8S40 29 41 34H33Z"
                className="fill-current"
            />
        </Plaque>
    );
}

/** Три hard: три пика */
export function Hard3Illustration({ className }: IllustrationProps) {
    return (
        <Plaque className={className}>
            <path
                d="M8 36h32"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="square"
            />
            <path
                d="M10 36l5-12 4 6 3-8 6 14H10Z"
                className="fill-current opacity-25"
                stroke="currentColor"
                strokeWidth="1.5"
            />
            <path
                d="M22 36l4-14 3 5 3-7 6 16H22Z"
                className="fill-current opacity-45"
                stroke="currentColor"
                strokeWidth="1.5"
            />
            <path
                d="M30 36l5-16 4 8 3-6 6 14H30Z"
                className="fill-current opacity-75"
                stroke="currentColor"
                strokeWidth="1.5"
            />
        </Plaque>
    );
}

export const ACHIEVEMENT_ILLUSTRATIONS: Record<
    AchievementCode,
    (props: IllustrationProps) => ReactNode
> = {
    FIRST_QUIZ: FirstQuizIllustration,
    QUIZZES_5: Quizzes5Illustration,
    QUIZZES_10: Quizzes10Illustration,
    QUIZZES_25: Quizzes25Illustration,
    QUIZZES_50: Quizzes50Illustration,
    PERFECT_QUIZ: PerfectQuizIllustration,
    PERFECT_3: Perfect3Illustration,
    DAILY_COMPLETE: DailyCompleteIllustration,
    DAILY_3: Daily3Illustration,
    TIMED_COMPLETE: TimedCompleteIllustration,
    CLASSIC_AND_TIMED: ClassicAndTimedIllustration,
    HIGH_ACCURACY_90: HighAccuracy90Illustration,
    POINTS_250: Points250Illustration,
    MEDIUM_QUIZ: MediumQuizIllustration,
    MEDIUM_5: Medium5Illustration,
    HARD_QUIZ: HardQuizIllustration,
    HARD_3: Hard3Illustration,
};
