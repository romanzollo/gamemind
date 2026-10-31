'use client';

/**
 * Предзагрузка картинок партии в кеш браузера.
 *
 * Зачем: Survival показывает вопросы по одному, и картинка следующего
 * вопроса начинала грузиться только при его показе (~1 с из РФ) — это
 * время шло из банка. Хук запускает загрузку всех картинок волны сразу
 * (во время заставки 3‑2‑1); QuestionImage потом берёт их из кеша.
 * URL нормализуем так же, как QuestionImage, иначе кеш не совпадёт.
 * Только из Client Components.
 */

import { useEffect, useRef } from 'react';

import { normalizeQuizImageUrl } from '@/shared/utils/normalize-quiz-image-url';

export function usePreloadQuizImages(
    urls: ReadonlyArray<string | null | undefined>,
): void {
    // Держим ссылки, чтобы сборщик мусора не прервал загрузку.
    const pendingRef = useRef<HTMLImageElement[]>([]);
    const key = urls
        .map((url) => normalizeQuizImageUrl(url))
        .filter((url): url is string => url != null)
        .join('\n');

    useEffect(() => {
        if (!key) {
            return;
        }

        pendingRef.current = key.split('\n').map((src) => {
            const image = new Image();
            image.decoding = 'async';
            image.src = src;
            return image;
        });
    }, [key]);
}
