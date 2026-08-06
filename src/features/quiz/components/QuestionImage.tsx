'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { normalizeQuizImageUrl } from '@/shared/utils/normalize-quiz-image-url';

type QuestionImageProps = {
    src: string;
    alt: string;
    unavailableLabel: string;
    /** First visible image in the session — skip lazy load. */
    priority?: boolean;
    /** Подсказка «нажмите, чтобы увеличить» (i18n). */
    expandHint: string;
    /** aria-label кнопки/диалога просмотра. */
    expandLabel: string;
    /** Подпись кнопки закрытия лайтбокса. */
    closeLabel: string;
};

type LoadState = 'loading' | 'ready' | 'error';

/** Retro easy-tier shots are upscaled pixel art — keep edges crisp. */
function isPixelArtPath(src: string) {
    return src.includes('/quiz-images/easy/');
}

/**
 * Промпт IMAGE_GUESS: полный кадр (object-contain) + лайтбокс по клику.
 * Лайтбокс — Scoreboard Editorial: спокойный scrim, без glow; Esc / клик вне /
 * кнопка закрытия; на мобиле — почти весь viewport с safe-area.
 */
export function QuestionImage({
    src,
    alt,
    unavailableLabel,
    priority = false,
    expandHint,
    expandLabel,
    closeLabel,
}: QuestionImageProps) {
    const resolvedSrc = normalizeQuizImageUrl(src) ?? src;
    const [loadState, setLoadState] = useState<LoadState>('loading');
    const [isOpen, setIsOpen] = useState(false);
    const pixelArt = isPixelArtPath(resolvedSrc);
    const titleId = useId();
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const openButtonRef = useRef<HTMLButtonElement>(null);

    const close = useCallback(() => {
        setIsOpen(false);
    }, []);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        closeButtonRef.current?.focus();

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                close();
            }
        };

        window.addEventListener('keydown', onKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', onKeyDown);
            openButtonRef.current?.focus();
        };
    }, [isOpen, close]);

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

    const imageClassName = [
        'relative z-10 mx-auto block h-auto w-auto max-w-full object-contain',
        pixelArt ? '[image-rendering:pixelated]' : '',
        loadState === 'ready' ? 'opacity-100' : 'opacity-0',
        'motion-safe:transition-opacity duration-200',
    ].join(' ');

    return (
        <>
            <figure className="w-full overflow-hidden rounded-md border border-border bg-surface-muted shadow-sm">
                <div className="relative flex flex-col items-center justify-center px-3 py-4 sm:px-5 sm:py-5">
                    {loadState === 'loading' ? (
                        <div
                            className="absolute inset-3 animate-pulse rounded-md bg-border/40 sm:inset-5"
                            aria-hidden
                        />
                    ) : null}

                    <button
                        ref={openButtonRef}
                        type="button"
                        onClick={() => setIsOpen(true)}
                        disabled={loadState !== 'ready'}
                        aria-label={expandLabel}
                        className={[
                            'group relative max-w-full rounded-sm',
                            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                            'disabled:cursor-default',
                            loadState === 'ready'
                                ? 'cursor-zoom-in'
                                : 'cursor-wait',
                        ].join(' ')}
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            key={resolvedSrc}
                            src={resolvedSrc}
                            alt={alt}
                            loading={priority ? 'eager' : 'lazy'}
                            decoding="async"
                            onLoad={() => setLoadState('ready')}
                            onError={() => setLoadState('error')}
                            className={[
                                imageClassName,
                                'max-h-[min(40vh,17rem)] sm:max-h-[min(56vh,26rem)]',
                                'motion-safe:group-hover:brightness-[0.97]',
                            ].join(' ')}
                        />
                    </button>

                    {loadState === 'ready' ? (
                        <p className="mt-2.5 text-center text-xs leading-relaxed text-muted sm:text-sm">
                            {expandHint}
                        </p>
                    ) : null}
                </div>
            </figure>

            {isOpen ? (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={titleId}
                >
                    <button
                        type="button"
                        aria-label={closeLabel}
                        className="absolute inset-0 bg-foreground/70 backdrop-blur-[2px]"
                        onClick={close}
                    />

                    <div
                        className={[
                            'relative z-10 flex max-h-[100dvh] w-full max-w-[100vw] flex-col',
                            'px-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]',
                            'pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]',
                            'sm:px-6 sm:py-6',
                        ].join(' ')}
                    >
                        <div className="mb-3 flex shrink-0 items-center justify-between gap-3 sm:mb-4">
                            <p
                                id={titleId}
                                className="min-w-0 truncate font-display text-sm font-semibold tracking-wide text-primary-foreground sm:text-base"
                            >
                                {alt}
                            </p>
                            <button
                                ref={closeButtonRef}
                                type="button"
                                onClick={close}
                                className={[
                                    'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md',
                                    'border border-primary-foreground/25 bg-surface/95 px-3 text-sm font-semibold text-foreground',
                                    'shadow-sm backdrop-blur-sm',
                                    'hover:bg-surface-hover',
                                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                                ].join(' ')}
                            >
                                {closeLabel}
                            </button>
                        </div>

                        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={resolvedSrc}
                                alt={alt}
                                className={[
                                    'mx-auto h-auto w-auto max-w-full object-contain',
                                    'max-h-[calc(100dvh-5.5rem)] sm:max-h-[calc(100dvh-6.5rem)]',
                                    'rounded-md bg-surface shadow-lg',
                                    pixelArt ? '[image-rendering:pixelated]' : '',
                                ].join(' ')}
                            />
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}
