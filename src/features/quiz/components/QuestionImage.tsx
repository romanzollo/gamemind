'use client';

import { useEffect, useRef, useState } from 'react';

import { normalizeQuizImageUrl } from '@/shared/utils/normalize-quiz-image-url';

type QuestionImageProps = {
    src: string;
    alt: string;
    unavailableLabel: string;
    /** First visible image in the session — skip lazy load. */
    priority?: boolean;
};

type LoadState = 'loading' | 'ready' | 'error';

/** Retro easy-tier shots are upscaled pixel art — keep edges crisp. */
function isPixelArtPath(src: string) {
    return src.includes('/quiz-images/easy/');
}

function readImageState(img: HTMLImageElement | null): LoadState | null {
    if (!img) {
        return null;
    }

    if (img.complete) {
        return img.naturalWidth > 0 ? 'ready' : 'error';
    }

    return null;
}

/**
 * Native <img> keeps real aspect ratio (next/image fixed 16:9 box was cropping).
 * Soft theme surface behind the frame — no cinema black bars.
 * Never use object-cover / fixed aspect crop here.
 */
export function QuestionImage({
    src,
    alt,
    unavailableLabel,
    priority = false,
}: QuestionImageProps) {
    const resolvedSrc = normalizeQuizImageUrl(src) ?? src;
    const [loadState, setLoadState] = useState<LoadState>('loading');
    const imgRef = useRef<HTMLImageElement | null>(null);
    const pixelArt = isPixelArtPath(resolvedSrc);

    useEffect(() => {
        setLoadState('loading');

        // Cached images may already be complete before onLoad is attached.
        const cached = readImageState(imgRef.current);
        if (cached) {
            setLoadState(cached);
        }
    }, [resolvedSrc]);

    if (loadState === 'error') {
        return (
            <figure
                className="flex min-h-28 items-center justify-center rounded-md border border-dashed border-border bg-surface-muted px-4 py-6"
                role="img"
                aria-label={alt}
            >
                <p className="text-center text-sm leading-relaxed text-muted">
                    {unavailableLabel}
                </p>
            </figure>
        );
    }

    return (
        <figure className="w-full overflow-hidden rounded-md border border-border bg-surface-muted shadow-sm">
            <div className="relative flex items-center justify-center px-3 py-4 sm:px-5 sm:py-5">
                {loadState === 'loading' ? (
                    <div
                        className="absolute inset-3 animate-pulse rounded-md bg-border/40 sm:inset-5"
                        aria-hidden
                    />
                ) : null}

                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    key={resolvedSrc}
                    ref={imgRef}
                    src={resolvedSrc}
                    alt={alt}
                    loading={priority ? 'eager' : 'lazy'}
                    decoding="async"
                    onLoad={() => setLoadState('ready')}
                    onError={() => setLoadState('error')}
                    className={[
                        // Full-frame: natural ratio, scale down only — never crop.
                        'relative z-10 mx-auto block h-auto w-auto max-w-full object-contain',
                        'max-h-[min(40vh,17rem)] sm:max-h-[min(56vh,26rem)]',
                        pixelArt ? '[image-rendering:pixelated]' : '',
                        loadState === 'ready' ? 'opacity-100' : 'opacity-0',
                        'motion-safe:transition-opacity duration-200',
                    ].join(' ')}
                />
            </div>
        </figure>
    );
}
