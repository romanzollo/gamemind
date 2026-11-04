'use client';

/**
 * Превью картинки-подсказки IMAGE_GUESS в списке админки.
 *
 * Исходники — кадры 1280×720 (~75 КБ); в списке они видны 112×64 (таблица)
 * или ~350×180 (карточка на телефоне). next/image отдаёт ужатую копию
 * нужной ширины (1x / 2x) через `/_next/image` — на нашем домене, из РФ
 * доступно. Ужатие на Vercel платное сверх лимита Hobby (5K/месяц): если
 * оно не сработало (лимит, 402, недоступный источник), показываем исходный
 * файл — превью не должно пустеть (ADR «Admin list previews via next/image»).
 *
 * Ужимаем только свои пути (canOptimizePromptImage); остальное — как есть.
 */

import Image from 'next/image';
import { useState } from 'react';

import { canOptimizePromptImage } from '@/features/admin/lib/can-optimize-prompt-image';

type AdminPromptImageProps = {
    src: string;
    alt: string;
    /** Размер в CSS px, под который ужимаем: srcset получит 1x и 2x. */
    width: number;
    height: number;
    className?: string;
};

export function AdminPromptImage({
    src,
    alt,
    width,
    height,
    className,
}: AdminPromptImageProps) {
    // Ключ — сам src: на новой странице списка ужатие пробуем заново.
    const [failedSrc, setFailedSrc] = useState<string | null>(null);
    const unoptimized = failedSrc === src || !canOptimizePromptImage(src);

    return (
        <Image
            src={src}
            alt={alt}
            width={width}
            height={height}
            loading="lazy"
            unoptimized={unoptimized}
            onError={() => {
                if (!unoptimized) {
                    setFailedSrc(src);
                }
            }}
            className={className}
        />
    );
}
