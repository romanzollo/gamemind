/**
 * Illustration pack Achievements — Quiz Arcade (Scoreboard Editorial).
 *
 * Зачем отдельный язык знаков:
 * - бейдж читается как знак квиз-матча, не как офисный график и не как Steam-стикер;
 * - коды domain-agnostic (`FIRST_QUIZ`, не video-game slug) — DECISIONS → Achievements MVP;
 * - один визуальный язык с plaque: currentColor + opacity, без PNG / emoji / Lucide.
 *
 * Канон пака (не ломать):
 * - viewBox 0 0 48 48, Plaque 42×42 при x/y = 3 (рамка до x=45);
 * - контент в safe box ≈ 10…38; stroke не выходит за plaque (не чинить overflow-hidden);
 * - light/dark без отдельных ассетов; новый бейдж = SVG + запись в ACHIEVEMENT_ILLUSTRATIONS.
 *
 * Словарь Quiz Arcade: карта раунда, combo-засечки, S-rank / combo-круг, штамп daily,
 * секундомер блица, табло очков (7 сегментов), ранг/босс-ступень,
 * гребень волны (семья Выживания).
 * Запрещено: геймпад, картридж, пиксель-арт, чужие франшизы, черепа, XP-бар, неон, растр.
 *
 * UI тянет знаки только через AchievementMark.
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

/** Карта вопроса — базовый знак квиза (не геймпад). */
function QuestionCardFrame({
    x,
    y,
    width,
    height,
}: {
    x: number;
    y: number;
    width: number;
    height: number;
}) {
    return (
        <rect
            x={x}
            y={y}
            width={width}
            height={height}
            className="fill-current opacity-[0.12]"
            stroke="currentColor"
            strokeWidth="1.5"
        />
    );
}

/** Молния блица (заполненный зигзаг, без обводки — нет miter за plaque). */
function LightningBolt({
    x,
    y,
    scale = 1,
}: {
    x: number;
    y: number;
    scale?: number;
}) {
    return (
        <g transform={`translate(${x} ${y}) scale(${scale})`}>
            <path
                d="M9 0 1.2 11.2h4.1L2.4 22l9.2-10.1H7.6L9 0Z"
                className="fill-current"
            />
        </g>
    );
}

/**
 * Шеврон ранга матча: широкий и низкий (сержантская нашивка), не горный пик.
 * filled = жирная ступень; иначе слот.
 */
function RankChevron({
    cx,
    cy,
    width,
    height,
    filled,
    compact = false,
}: {
    cx: number;
    cy: number;
    width: number;
    height: number;
    filled: boolean;
    compact?: boolean;
}) {
    const half = width / 2;
    const filledWidth = compact ? 2 : 2.4;
    return (
        <path
            d={`M${cx - half} ${cy} L${cx} ${cy - height} L${cx + half} ${cy}`}
            stroke="currentColor"
            strokeWidth={filled ? filledWidth : 1.5}
            className={filled ? undefined : 'opacity-40'}
            strokeLinecap="square"
            strokeLinejoin="miter"
            strokeMiterlimit={2}
        />
    );
}

/** Босс-пип высшей сложности — ромб над шевроном, не «пик холма». */
function BossDiamond({ cx, cy, size = 2.4 }: { cx: number; cy: number; size?: number }) {
    return (
        <path
            d={`M${cx} ${cy - size} L${cx + size} ${cy} L${cx} ${cy + size} L${cx - size} ${cy} Z`}
            className="fill-current"
        />
    );
}

/**
 * Mid-ранг пип: широкий треугольник.
 * Тот же приём счёта, что у HARD_3 (ряд пипов + шеврон), но не ромб.
 */
function MediumPip({ cx, cy, size = 2.15 }: { cx: number; cy: number; size?: number }) {
    const w = size * 1.15;
    const h = size * 1.05;
    return (
        <path
            d={`M${cx} ${cy - h} L${cx + w} ${cy + h * 0.4} L${cx - w} ${cy + h * 0.4} Z`}
            className="fill-current"
        />
    );
}

/** Combo-круг: полный или с разрывом (~10% для 90% accuracy). Без стрелок. */
function ComboRing({
    cx,
    cy,
    r,
    gapFraction = 0,
    strokeWidth = 2,
    fillDisc = true,
}: {
    cx: number;
    cy: number;
    r: number;
    gapFraction?: number;
    strokeWidth?: number;
    fillDisc?: boolean;
}) {
    const circumference = 2 * Math.PI * r;
    const gap = circumference * gapFraction;
    const dash = circumference - gap;

    return (
        <circle
            cx={cx}
            cy={cy}
            r={r}
            className={fillDisc ? 'fill-current opacity-10' : undefined}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
            strokeDasharray={gapFraction > 0 ? `${dash} ${gap}` : undefined}
            transform={gapFraction > 0 ? `rotate(-90 ${cx} ${cy})` : undefined}
        />
    );
}

/** Клетка табло 2×2 (четверть / половина сотни). */
function ScoreCell({
    x,
    y,
    filled,
}: {
    x: number;
    y: number;
    filled: boolean;
}) {
    return (
        <rect
            x={x}
            y={y}
            width="10"
            height="10"
            className={filled ? 'fill-current opacity-90' : 'fill-current opacity-[0.08]'}
            stroke="currentColor"
            strokeWidth="1.5"
        />
    );
}

/** Сегменты табло: a верх, b/c правые, d низ, e/f левые, g середина. */
const SEGMENTS_BY_DIGIT: Record<string, string> = {
    '0': 'abcdef',
    '1': 'bc',
    '3': 'abgcd',
    '5': 'afgcd',
    '7': 'abc',
};

/**
 * Число на arcade-табло (7 сегментов, одна обводка) — как цифры POINTS_250.
 * Только цифры из SEGMENTS_BY_DIGIT; неизвестная цифра не рисуется.
 */
function SegmentNumber({
    value,
    x,
    y,
    digitWidth,
    height,
    gap,
    strokeWidth = 1.9,
}: {
    value: string;
    x: number;
    y: number;
    digitWidth: number;
    height: number;
    gap: number;
    strokeWidth?: number;
}) {
    const half = height / 2;
    const d = Array.from(value)
        .map((digit, index) => {
            const left = x + index * (digitWidth + gap);
            const right = left + digitWidth;
            const segments = SEGMENTS_BY_DIGIT[digit] ?? '';
            const paths: Record<string, string> = {
                a: `M${left} ${y}H${right}`,
                b: `M${right} ${y}V${y + half}`,
                c: `M${right} ${y + half}V${y + height}`,
                d: `M${left} ${y + height}H${right}`,
                e: `M${left} ${y + half}V${y + height}`,
                f: `M${left} ${y}V${y + half}`,
                g: `M${left} ${y + half}H${right}`,
            };
            return Array.from(segments)
                .map((segment) => paths[segment])
                .join('');
        })
        .join('');

    return (
        <path
            d={d}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="square"
        />
    );
}

/**
 * Гребень волны Выживания: чередующиеся дуги через quadratic `t`.
 * Знак семьи Survival (волна / забег), не «график роста».
 */
function WaveCrest({
    y,
    x1 = 11,
    x2 = 37,
    amplitude = 2.4,
    halfWaves = 6,
    strokeWidth = 1.9,
    className,
}: {
    y: number;
    x1?: number;
    x2?: number;
    amplitude?: number;
    halfWaves?: number;
    strokeWidth?: number;
    className?: string;
}) {
    const step = (x2 - x1) / halfWaves;
    const rest = Array.from({ length: halfWaves - 1 }, () => `t${step} 0`).join('');

    return (
        <path
            d={`M${x1} ${y}q${step / 2} ${-amplitude * 2} ${step} 0${rest}`}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            className={className}
        />
    );
}

/** Штамп-календарь квеста (семья Daily): рамка, шапка, кольца переплёта. */
function DailyStamp() {
    return (
        <>
            <rect
                x="12"
                y="13"
                width="24"
                height="23"
                className="fill-current opacity-[0.12]"
                stroke="currentColor"
                strokeWidth="1.5"
            />
            <rect
                x="12"
                y="13"
                width="24"
                height="7"
                className="fill-current opacity-25"
            />
            <path
                d="M17 11v5M31 11v5"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="square"
            />
        </>
    );
}

/**
 * Начало: карта раунда с табло-цифрой 1.
 * «?» на 40px читался как help, а не как квиз — не используем.
 */
export function FirstQuizIllustration({ className }: IllustrationProps) {
    return (
        <Plaque className={className}>
            <QuestionCardFrame x={13} y={11} width={22} height={26} />
            {/* Ствол по центру карты (x=24); флажок слева не смещает оптику. */}
            <rect
                x="22.4"
                y="15.2"
                width="3.6"
                height="18.2"
                className="fill-current"
            />
            <path
                d="M20.6 19.4 24.2 14.6H26V17.6L22.4 20.2Z"
                className="fill-current"
            />
            <rect
                x="20"
                y="32.6"
                width="8.8"
                height="2.2"
                className="fill-current"
            />
        </Plaque>
    );
}

/** Ритм: пять равных combo-хитов на рельсе, не растущий барчарт. */
export function Quizzes5Illustration({ className }: IllustrationProps) {
    return (
        <Plaque className={className}>
            <path
                d="M11 34.5h26"
                stroke="currentColor"
                strokeWidth="1.5"
                className="opacity-25"
                strokeLinecap="square"
            />
            {/* Пять равных combo-слэшей — ритм, не excel-столбики. */}
            <path
                d="M12.4 33.2l4.4-16M17.4 33.2l4.4-16M22.4 33.2l4.4-16M27.4 33.2l4.4-16M32.4 33.2l4.4-16"
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="square"
            />
        </Plaque>
    );
}

/** Серия ×10: две группы tally 5+5, не вторая лестница столбиков. */
export function Quizzes10Illustration({ className }: IllustrationProps) {
    return (
        <Plaque className={className}>
            <path
                d="M12 16v17M15.1 16v17M18.2 16v17M21.3 16v17"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="square"
            />
            <path
                d="M12 16l9.3 17"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="square"
            />
            <path
                d="M26.2 16v17M29.3 16v17M32.4 16v17M35.5 16v17"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="square"
            />
            <path
                d="M26.2 16l9.3 17"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="square"
            />
        </Plaque>
    );
}

/** Четверть сотни: табло 2×2, одна клетка. */
export function Quizzes25Illustration({ className }: IllustrationProps) {
    return (
        <Plaque className={className}>
            <ScoreCell x={12.5} y={12.5} filled />
            <ScoreCell x={25.5} y={12.5} filled={false} />
            <ScoreCell x={12.5} y={25.5} filled={false} />
            <ScoreCell x={25.5} y={25.5} filled={false} />
        </Plaque>
    );
}

/** Полтинник: то же табло, две клетки (половина сотни). */
export function Quizzes50Illustration({ className }: IllustrationProps) {
    return (
        <Plaque className={className}>
            <ScoreCell x={12.5} y={12.5} filled />
            <ScoreCell x={25.5} y={12.5} filled />
            <ScoreCell x={12.5} y={25.5} filled={false} />
            <ScoreCell x={25.5} y={25.5} filled={false} />
        </Plaque>
    );
}

/** Чистый раунд: полный combo-круг + S-rank (не щит). */
export function PerfectQuizIllustration({ className }: IllustrationProps) {
    return (
        <Plaque className={className}>
            <ComboRing cx={24} cy={24} r={11} />
            <rect x="20.2" y="17.2" width="7.6" height="2.1" className="fill-current" />
            <rect x="20.2" y="17.2" width="2.1" height="7.2" className="fill-current" />
            <rect x="20.2" y="22.8" width="7.6" height="2.1" className="fill-current" />
            <rect x="25.7" y="22.8" width="2.1" height="7.2" className="fill-current" />
            <rect x="20.2" y="28.4" width="7.6" height="2.1" className="fill-current" />
        </Plaque>
    );
}

/** Три чистых: три combo-круга, не ромбы. */
export function Perfect3Illustration({ className }: IllustrationProps) {
    return (
        <Plaque className={className}>
            <ComboRing cx={24} cy={17} r={5} strokeWidth={1.6} />
            <ComboRing cx={17} cy={31} r={5} strokeWidth={1.6} />
            <ComboRing cx={31} cy={31} r={5} strokeWidth={1.6} />
        </Plaque>
    );
}

/** Почти идеал: combo-круг с ~10% разрывом. Без часовых стрелок. */
export function HighAccuracy90Illustration({ className }: IllustrationProps) {
    return (
        <Plaque className={className}>
            <ComboRing
                cx={24}
                cy={24}
                r={11}
                gapFraction={0.1}
                strokeWidth={2.25}
                fillDisc={false}
            />
        </Plaque>
    );
}

/** Челлендж принят: штамп-календарь квеста + одна ячейка. */
export function DailyCompleteIllustration({ className }: IllustrationProps) {
    return (
        <Plaque className={className}>
            <rect
                x="12"
                y="13"
                width="24"
                height="23"
                className="fill-current opacity-[0.12]"
                stroke="currentColor"
                strokeWidth="1.5"
            />
            <rect
                x="12"
                y="13"
                width="24"
                height="7"
                className="fill-current opacity-25"
            />
            <path
                d="M17 11v5M31 11v5"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="square"
            />
            <rect x="21" y="25" width="6" height="6" className="fill-current" />
        </Plaque>
    );
}

/** Три дня в деле: три соседние клетки квеста. */
export function Daily3Illustration({ className }: IllustrationProps) {
    return (
        <Plaque className={className}>
            <rect
                x="12"
                y="13"
                width="24"
                height="23"
                className="fill-current opacity-[0.12]"
                stroke="currentColor"
                strokeWidth="1.5"
            />
            <rect
                x="12"
                y="13"
                width="24"
                height="7"
                className="fill-current opacity-25"
            />
            <path
                d="M17 11v5M31 11v5"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="square"
            />
            <rect x="15" y="25" width="5" height="6" className="fill-current" />
            <rect x="21.5" y="25" width="5" height="6" className="fill-current" />
            <rect x="28" y="25" width="5" height="6" className="fill-current" />
        </Plaque>
    );
}

/**
 * Блиц принят: молния внутри циферблата секундомера.
 * Засечки 12/3/6/9 делают круг циферблатом, не «кольцом прогресса»
 * и не часами со стрелками (те путали с HIGH_ACCURACY_90).
 */
export function TimedCompleteIllustration({ className }: IllustrationProps) {
    const cx = 24;
    const cy = 24.8;
    const r = 11;
    const tick = 2.5;

    return (
        <Plaque className={className}>
            <rect
                x="22.2"
                y="10.4"
                width="3.6"
                height="3.4"
                className="fill-current"
            />
            <circle
                cx={cx}
                cy={cy}
                r={r}
                className="fill-current opacity-[0.08]"
                stroke="currentColor"
                strokeWidth="1.75"
            />
            <path
                d={`M${cx} ${cy - r + 1}v${tick}M${cx + r - 1} ${cy}h${-tick}M${cx} ${cy + r - 1}v${-tick}M${cx - r + 1} ${cy}h${tick}`}
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="square"
            />
            {/* Болт вписан в диск: local bbox ≈ (6.4, 11), scale 0.5 */}
            <LightningBolt x={cx - 6.4 * 0.5} y={cy - 11 * 0.5} scale={0.5} />
        </Plaque>
    );
}

/**
 * Оба режима: лист классики (строки вопроса) + молния блица.
 * Два разных знака; без «?», чтобы не путать с блицем.
 */
export function ClassicAndTimedIllustration({ className }: IllustrationProps) {
    return (
        <Plaque className={className}>
            <QuestionCardFrame x={10.5} y={13} width={13} height={22} />
            <path
                d="M13.2 19h7.4M13.2 24h7.4M13.2 29h4.8"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="square"
            />
            <path
                d="M24.5 15v18"
                stroke="currentColor"
                strokeWidth="1.5"
                className="opacity-25"
                strokeLinecap="square"
            />
            <LightningBolt x={27} y={13.5} scale={0.88} />
        </Plaque>
    );
}

/** Счётчик на 250: arcade-табло с цифрами, не абстрактная черта. */
export function Points250Illustration({ className }: IllustrationProps) {
    return (
        <Plaque className={className}>
            <rect
                x="10.5"
                y="14.5"
                width="27"
                height="19"
                className="fill-current opacity-[0.12]"
                stroke="currentColor"
                strokeWidth="1.5"
            />
            {/* 2 */}
            <path
                d="M12.4 18.2h7.2v5.4H12.4v5.4h7.2"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="square"
                strokeLinejoin="miter"
                strokeMiterlimit={2}
            />
            {/* 5 */}
            <path
                d="M28.4 18.2h-7.2v5.4h7.2v5.4h-7.2"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="square"
                strokeLinejoin="miter"
                strokeMiterlimit={2}
            />
            {/* 0 */}
            <rect
                x="30.2"
                y="18.2"
                width="7.2"
                height="10.8"
                stroke="currentColor"
                strokeWidth="1.7"
            />
        </Plaque>
    );
}

/** Средняя лига: три ранга матча, залита средняя. Не холм. */
export function MediumQuizIllustration({ className }: IllustrationProps) {
    return (
        <Plaque className={className}>
            <RankChevron cx={24} cy={20} width={22} height={6.2} filled={false} />
            <RankChevron cx={24} cy={27.2} width={22} height={6.2} filled />
            <RankChevron cx={24} cy={34.4} width={22} height={6.2} filled={false} />
        </Plaque>
    );
}

/** Пять средних: пять mid-пипов + шеврон — та же схема, что HARD_3. */
export function Medium5Illustration({ className }: IllustrationProps) {
    return (
        <Plaque className={className}>
            <MediumPip cx={13} cy={19.6} />
            <MediumPip cx={18.5} cy={19.6} />
            <MediumPip cx={24} cy={19.6} />
            <MediumPip cx={29.5} cy={19.6} />
            <MediumPip cx={35} cy={19.6} />
            <RankChevron cx={24} cy={34.2} width={24} height={6.4} filled />
        </Plaque>
    );
}

/** Высшая сложность: босс-ромб + верхний ранг. Отличим от medium без подписи. */
export function HardQuizIllustration({ className }: IllustrationProps) {
    return (
        <Plaque className={className}>
            <BossDiamond cx={24} cy={12.8} size={2.4} />
            <RankChevron cx={24} cy={21.8} width={22} height={5.8} filled />
            <RankChevron cx={24} cy={28.8} width={22} height={5.8} filled={false} />
            <RankChevron cx={24} cy={35.8} width={22} height={5.8} filled={false} />
        </Plaque>
    );
}

/**
 * Три тяжёлых: три босс-ромба (тот же маркер, что у HARD_QUIZ) + шеврон.
 * Мини-пипы на 40px схлопывались в три квадрата — ромбы крупнее.
 */
export function Hard3Illustration({ className }: IllustrationProps) {
    return (
        <Plaque className={className}>
            <BossDiamond cx={15} cy={20} size={4.6} />
            <BossDiamond cx={24} cy={20} size={4.6} />
            <BossDiamond cx={33} cy={20} size={4.6} />
            <RankChevron cx={24} cy={34.2} width={24} height={6.4} filled />
        </Plaque>
    );
}

/**
 * Серия дней: штамп Челленджа + число дней + сплошная черта «подряд».
 * Отличие от «Три челленджа» (три отдельные клетки) — именно непрерывная черта.
 */
function DailyStreakMark({
    className,
    days,
}: IllustrationProps & { days: '3' | '7' | '30' }) {
    const twoDigits = days.length === 2;
    return (
        <Plaque className={className}>
            <DailyStamp />
            <SegmentNumber
                value={days}
                x={twoDigits ? 16.75 : 20.5}
                y={21.8}
                digitWidth={twoDigits ? 6 : 7}
                height={9.4}
                gap={2.5}
                strokeWidth={2}
            />
            <rect x="15" y="33" width="18" height="1.9" className="fill-current" />
        </Plaque>
    );
}

export function DailyStreak3Illustration({ className }: IllustrationProps) {
    return <DailyStreakMark className={className} days="3" />;
}

export function DailyStreak7Illustration({ className }: IllustrationProps) {
    return <DailyStreakMark className={className} days="7" />;
}

export function DailyStreak30Illustration({ className }: IllustrationProps) {
    return <DailyStreakMark className={className} days="30" />;
}

/**
 * Молния: крупный болт внутри замкнутого combo-кольца.
 * Кольцо = «всё верно» (как PERFECT_QUIZ), болт = Блиц; без засечек и
 * кнопки секундомера — иначе сливается с «Блиц принят».
 */
export function BlitzPerfectFastIllustration({ className }: IllustrationProps) {
    return (
        <Plaque className={className}>
            {/* fillDisc=false: с заливкой opacity-10 гасит и обводку — кольцо пропадает */}
            <ComboRing cx={24} cy={24} r={12} strokeWidth={2.6} fillDisc={false} />
            {/* Центр болта в local ≈ (6.4, 11), как у TIMED_COMPLETE → центр (24, 24) */}
            <LightningBolt x={24 - 6.4 * 0.85} y={24 - 11 * 0.85} scale={0.85} />
        </Plaque>
    );
}

/** Волна Выживания: номер волны на табло над гребнем + тихая вторая волна. */
function SurvivalWaveMark({
    className,
    wave,
}: IllustrationProps & { wave: '3' | '5' }) {
    return (
        <Plaque className={className}>
            <SegmentNumber
                value={wave}
                x={20}
                y={11.5}
                digitWidth={8}
                height={13}
                gap={0}
                strokeWidth={2.3}
            />
            <WaveCrest y={31} amplitude={2.2} />
            <WaveCrest y={36} amplitude={1.6} strokeWidth={1.5} className="opacity-40" />
        </Plaque>
    );
}

export function SurvivalWave3Illustration({ className }: IllustrationProps) {
    return <SurvivalWaveMark className={className} wave="3" />;
}

export function SurvivalWave5Illustration({ className }: IllustrationProps) {
    return <SurvivalWaveMark className={className} wave="5" />;
}

/** Десятый вал: «10» и два полных гребня — вал выше обычной волны. */
export function SurvivalWave10Illustration({ className }: IllustrationProps) {
    return (
        <Plaque className={className}>
            <SegmentNumber
                value="10"
                x={16.5}
                y={12}
                digitWidth={6}
                height={11.5}
                gap={3}
                strokeWidth={2.2}
            />
            <WaveCrest y={30.5} amplitude={3} halfWaves={4} strokeWidth={2.2} />
            <WaveCrest y={36} amplitude={2} halfWaves={6} strokeWidth={1.9} />
        </Plaque>
    );
}

/**
 * Очки забега: табло очков (как POINTS_250) + гребень волны под ним —
 * отличает «один забег Выживания» от суммы по всем играм.
 */
function SurvivalRunMark({
    className,
    points,
}: IllustrationProps & { points: '50' | '100' }) {
    const three = points.length === 3;
    return (
        <Plaque className={className}>
            <rect
                x="10.5"
                y="12.5"
                width="27"
                height="17"
                className="fill-current opacity-[0.12]"
                stroke="currentColor"
                strokeWidth="1.5"
            />
            <SegmentNumber
                value={points}
                x={three ? 13.4 : 15.5}
                y={15.6}
                digitWidth={three ? 5.6 : 7}
                height={10.8}
                gap={three ? 2.2 : 3}
                strokeWidth={1.7}
            />
            <WaveCrest y={35} amplitude={1.8} />
        </Plaque>
    );
}

export function SurvivalRun50Illustration({ className }: IllustrationProps) {
    return <SurvivalRunMark className={className} points="50" />;
}

export function SurvivalRun100Illustration({ className }: IllustrationProps) {
    return <SurvivalRunMark className={className} points="100" />;
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
    DAILY_STREAK_3: DailyStreak3Illustration,
    DAILY_STREAK_7: DailyStreak7Illustration,
    DAILY_STREAK_30: DailyStreak30Illustration,
    BLITZ_PERFECT_FAST: BlitzPerfectFastIllustration,
    SURVIVAL_WAVE_3: SurvivalWave3Illustration,
    SURVIVAL_WAVE_5: SurvivalWave5Illustration,
    SURVIVAL_WAVE_10: SurvivalWave10Illustration,
    SURVIVAL_RUN_50: SurvivalRun50Illustration,
    SURVIVAL_RUN_100: SurvivalRun100Illustration,
};
