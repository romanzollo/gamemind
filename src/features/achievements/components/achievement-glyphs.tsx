/**
 * Знаки внутри жетонов достижений (ADR «Achievement tokens»).
 *
 * Система: категория → один знак, повтор → метка «×N», количество → число.
 * - сколько игр / очки — число (Oswald);
 * - точность — галочка, «90%»;
 * - Челлендж дня — календарь; серия дней подряд — огонёк с числом;
 * - Блиц — секундомер, молния;
 * - сложность — столбики (2 из 3 = средняя, 3 из 3 = высшая);
 * - Выживание — волна с числом.
 * Всё в currentColor на сетке 32×32 (зона знака ≈ y 6…22, ниже — клетки
 * редкости жетона). Новое достижение = запись в ACHIEVEMENT_GLYPHS.
 */

import type { ReactNode } from 'react';

import type { AchievementCode } from '@/features/achievements/types';

const STROKE = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function Num({ text, size }: { text: string; size: number }) {
    return (
        <text
            x="16"
            y={size > 12 ? 20.6 : 19.6}
            textAnchor="middle"
            fontSize={size}
            fontWeight={700}
            fill="currentColor"
            className="font-display"
        >
            {text}
        </text>
    );
}

/** Маленькая подпись внутри знака (дни, номер волны). */
function Small({ text, y, size }: { text: string; y: number; size: number }) {
    return (
        <text x="16" y={y} textAnchor="middle" fontSize={size} fontWeight={700} fill="currentColor" className="font-display">
            {text}
        </text>
    );
}

/**
 * «×N» в правом верхнем углу — повтор достижения. Крестик — линиями:
 * в подмножестве Oswald, которое грузит сайт, знака «×» нет.
 */
function Times({ n }: { n: number }) {
    return (
        <>
            <path d="M19.4 6.9l2.2 2.2M21.6 6.9l-2.2 2.2" strokeWidth="0.9" {...STROKE} />
            <text x="22.4" y="10.4" fontSize="5.6" fontWeight={700} fill="currentColor" className="font-display">
                {n}
            </text>
        </>
    );
}

const check = <path d="M10.5 15.8l3.6 3.6 7.4-8" strokeWidth="2.6" {...STROKE} />;

function Calendar({ children }: { children?: ReactNode }) {
    return (
        <>
            <rect x="9.5" y="9" width="13" height="12" rx="2" strokeWidth="1.8" {...STROKE} />
            <path d="M9.5 12.6h13M12.8 7.2v3.2M19.2 7.2v3.2" strokeWidth="1.8" {...STROKE} />
            {children}
        </>
    );
}

function Flame({ days }: { days: string }) {
    return (
        <>
            <path
                d="M16 7.5c3.6 3 5.4 5.6 5.4 8.7a5.4 5.4 0 0 1-10.8 0c0-1.9.8-3.4 2.1-4.6.2 1.5 1 2.4 2 2.7-.6-2.6.1-4.8 1.3-6.8z"
                fill="currentColor"
                fillOpacity={0.22}
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
            />
            <Small text={days} y={20.2} size={days.length > 1 ? 5.6 : 6.6} />
        </>
    );
}

const stopwatch = (
    <>
        <circle cx="16" cy="15.6" r="6" strokeWidth="1.8" {...STROKE} />
        <path d="M16 15.6V12.4M14.2 7.6h3.6M21 10.4l1.2-1.2" strokeWidth="1.8" {...STROKE} />
    </>
);

const bolt = <path d="M17.6 7.5 11 16.4h4.6L14 22.7l6.6-8.9h-4.6z" fill="currentColor" />;

/** С меткой «×N» столбики ниже и левее: третий не заходит под метку. */
function Bars({ filled, withTimes = false }: { filled: number; withTimes?: boolean }) {
    const step = withTimes ? 2.8 : 3.4;
    const left = withTimes ? 8.2 : 10.2;
    return (
        <>
            {[0, 1, 2].map((i) => (
                <rect
                    key={i}
                    x={left + i * 4.4}
                    y={18.6 - (i + 1) * step}
                    width="3"
                    height={(i + 1) * step + 2}
                    rx="0.8"
                    fill={i < filled ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    strokeWidth="1.1"
                />
            ))}
        </>
    );
}

function Wave({ label }: { label: string }) {
    return (
        <>
            <path d="M8.6 18.6c1.9-2.8 3.5-2.8 5 0s3.3 2.8 4.9 0 3.3-2.8 4.9 0" strokeWidth="2.1" {...STROKE} />
            <Small text={label} y={14.4} size={label.length > 2 ? 6 : 7} />
        </>
    );
}

export const ACHIEVEMENT_GLYPHS: Record<AchievementCode, ReactNode> = {
    FIRST_QUIZ: <Num text="1" size={14} />,
    QUIZZES_5: <Num text="5" size={14} />,
    QUIZZES_10: <Num text="10" size={13} />,
    QUIZZES_25: <Num text="25" size={13} />,
    QUIZZES_50: <Num text="50" size={13} />,
    POINTS_250: <Num text="250" size={10.5} />,
    PERFECT_QUIZ: check,
    PERFECT_3: (
        <>
            {check}
            <Times n={3} />
        </>
    ),
    HIGH_ACCURACY_90: <Num text="90%" size={9.5} />,
    DAILY_COMPLETE: (
        <Calendar>
            <path d="M13.2 16.6l1.9 1.9 3.8-4" strokeWidth="1.7" {...STROKE} />
        </Calendar>
    ),
    DAILY_3: (
        <Calendar>
            <Small text="3" y={19.6} size={7} />
        </Calendar>
    ),
    DAILY_STREAK_3: <Flame days="3" />,
    DAILY_STREAK_7: <Flame days="7" />,
    DAILY_STREAK_30: <Flame days="30" />,
    TIMED_COMPLETE: stopwatch,
    BLITZ_PERFECT_FAST: bolt,
    CLASSIC_AND_TIMED: (
        <>
            <path d="M8.6 15.6l2.2 2.2 4-4.4" strokeWidth="2" {...STROKE} />
            <circle cx="20" cy="15.6" r="3.9" strokeWidth="1.6" {...STROKE} />
            <path d="M20 15.6v-2" strokeWidth="1.6" {...STROKE} />
        </>
    ),
    MEDIUM_QUIZ: <Bars filled={2} />,
    MEDIUM_5: (
        <>
            <Bars filled={2} withTimes />
            <Times n={5} />
        </>
    ),
    HARD_QUIZ: <Bars filled={3} />,
    HARD_3: (
        <>
            <Bars filled={3} withTimes />
            <Times n={3} />
        </>
    ),
    SURVIVAL_WAVE_3: <Wave label="3" />,
    SURVIVAL_WAVE_5: <Wave label="5" />,
    SURVIVAL_WAVE_10: <Wave label="10" />,
    SURVIVAL_RUN_50: <Wave label="50" />,
    SURVIVAL_RUN_100: <Wave label="100" />,
};
