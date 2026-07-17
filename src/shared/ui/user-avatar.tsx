'use client';

import { useEffect, useState } from 'react';

type UserAvatarSize = 'sm' | 'md';

type UserAvatarProps = {
    src: string | null | undefined;
    /** Для a11y; пустая строка если декоративный */
    alt?: string;
    size?: UserAvatarSize;
    className?: string;
};

const sizeClassName: Record<UserAvatarSize, string> = {
    sm: 'h-8 w-8',
    md: 'h-24 w-24',
};

/**
 * Круглый аватар: object-cover заполняет круг
 * Квадратный crop при upload — отдельный этап (R2 + sharp)
 */
export function UserAvatar({
    src,
    alt = '',
    size = 'sm',
    className = '',
}: UserAvatarProps) {
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        setFailed(false);
    }, [src]);

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
                role="img"
                aria-label={alt || undefined}
            />
        );
    }

    return (
        <div className={shellClassName}>
            {/* eslint-disable-next-line @next/next/no-img-element -- произвольный user URL */}
            <img
                src={src}
                alt={alt}
                className="h-full w-full object-cover object-center"
                onError={() => setFailed(true)}
            />
        </div>
    );
}
