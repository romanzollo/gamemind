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

export const ACHIEVEMENT_ILLUSTRATIONS: Record<
    AchievementCode,
    (props: IllustrationProps) => ReactNode
> = {
    FIRST_QUIZ: FirstQuizIllustration,
    QUIZZES_5: Quizzes5Illustration,
    QUIZZES_10: Quizzes10Illustration,
    PERFECT_QUIZ: PerfectQuizIllustration,
    DAILY_COMPLETE: DailyCompleteIllustration,
    MEDIUM_QUIZ: MediumQuizIllustration,
    HARD_QUIZ: HardQuizIllustration,
};
