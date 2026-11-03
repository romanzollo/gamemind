'use client';

import { useState } from 'react';

import {
    decodeAvatarPattern,
    type AvatarShape,
} from '@/shared/ui/avatar-pattern';

type UserAvatarSize = 'sm' | 'md';

type UserAvatarProps = {
    src: string | null | undefined;
    /** Вариант эмблемы без фото — `getAvatarPattern(userId)` на сервере. */
    pattern: number;
    /** Для a11y; пустая строка если декоративный */
    alt?: string;
    size?: UserAvatarSize;
    className?: string;
};

const sizeClassName: Record<UserAvatarSize, string> = {
    sm: 'h-8 w-8',
    md: 'h-24 w-24',
};

/** Фигуры в квадрате 40×40; круг рамки обрезает углы — держимся в r≈16. */
function EmblemShape({ shape }: { shape: AvatarShape }) {
    switch (shape) {
        case 'chevrons':
            return (
                <g
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={3.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M11 21 20 12l9 9" />
                    <path d="M11 29 20 20l9 9" opacity={0.6} />
                </g>
            );
        case 'rings':
            return (
                <g fill="none" stroke="currentColor" strokeWidth={3.5}>
                    {/* Дуга в три четверти — поворот даёт разные эмблемы */}
                    <circle
                        cx={20}
                        cy={20}
                        r={11}
                        strokeDasharray="52 17"
                        strokeLinecap="round"
                    />
                    <circle cx={20} cy={20} r={4.5} fill="currentColor" stroke="none" />
                </g>
            );
        case 'bars':
            return (
                <g fill="currentColor">
                    <rect x={10} y={22} width={5} height={10} rx={1} opacity={0.6} />
                    <rect x={17.5} y={16} width={5} height={16} rx={1} opacity={0.8} />
                    <rect x={25} y={9} width={5} height={23} rx={1} />
                </g>
            );
        case 'grid':
            return (
                <g fill="currentColor">
                    <rect x={10} y={10} width={6} height={6} rx={1} />
                    <rect x={24} y={10} width={6} height={6} rx={1} opacity={0.45} />
                    <rect x={17} y={17} width={6} height={6} rx={1} />
                    <rect x={10} y={24} width={6} height={6} rx={1} opacity={0.45} />
                    <rect x={24} y={24} width={6} height={6} rx={1} />
                </g>
            );
    }
}

/**
 * Полные имена классов — Tailwind находит их в исходнике; собранные из
 * строки (`bg-avatar-${n}`) в CSS бы не попали.
 */
const toneClassName: Record<number, string> = {
    1: 'bg-avatar-1',
    2: 'bg-avatar-2',
    3: 'bg-avatar-3',
    4: 'bg-avatar-4',
    5: 'bg-avatar-5',
    6: 'bg-avatar-6',
};

/**
 * Эмблема вместо фото: тон `--avatar-N` + фигура `--avatar-ink`.
 * Встроенный SVG — без запроса к серверу и без файлов.
 */
function AvatarEmblem({ pattern }: { pattern: number }) {
    const { tone, shape, rotation } = decodeAvatarPattern(pattern);

    return (
        <svg
            viewBox="0 0 40 40"
            className={`h-full w-full text-avatar-ink ${toneClassName[tone]}`}
            aria-hidden="true"
            focusable="false"
        >
            <g transform={`rotate(${rotation} 20 20)`}>
                <EmblemShape shape={shape} />
            </g>
        </svg>
    );
}

/**
 * Круглый аватар: фото (object-cover заполняет круг) или эмблема по id
 * игрока, если фото нет или ссылка не загрузилась.
 * Квадратный crop при upload — отдельный этап (R2 + sharp)
 */
export function UserAvatar({
    src,
    pattern,
    alt = '',
    size = 'sm',
    className = '',
}: UserAvatarProps) {
    const [failedSrc, setFailedSrc] = useState<string | null>(null);
    const failed = Boolean(src) && failedSrc === src;

    const shellClassName = [
        'shrink-0 overflow-hidden rounded-full border border-border bg-surface-muted',
        sizeClassName[size],
        className,
    ]
        .filter(Boolean)
        .join(' ');

    if (!src || failed) {
        return (
            <div
                className={shellClassName}
                role={alt ? 'img' : undefined}
                aria-label={alt || undefined}
                aria-hidden={alt ? undefined : true}
            >
                <AvatarEmblem pattern={pattern} />
            </div>
        );
    }

    return (
        <div className={shellClassName}>
            {/* eslint-disable-next-line @next/next/no-img-element -- произвольный user URL */}
            <img
                src={src}
                alt={alt}
                className="h-full w-full object-cover object-center"
                onError={() => setFailedSrc(src)}
            />
        </div>
    );
}
