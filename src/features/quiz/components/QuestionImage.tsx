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
    /** aria-label кнопки открытия. */
    expandLabel: string;
    /** aria-label поверхности закрытия лайтбокса (без видимой кнопки). */
    closeLabel: string;
};

type LoadState = 'loading' | 'ready' | 'error';

/** Retro easy-tier shots are upscaled pixel art — keep edges crisp. */
function isPixelArtPath(src: string) {
    return src.includes('/quiz-images/easy/');
}

function isDismissKey(key: string) {
    return (
        key === 'Escape' ||
        key === 'Enter' ||
        key === ' ' ||
        key === 'Spacebar' ||
        key === 'Backspace'
    );
}

/**
 * Промпт IMAGE_GUESS: полный кадр (object-contain) + лайтбокс.
 * Закрытие без кнопки Close: клик / тап / Esc·Enter·Space·Backspace
 * (паттерн lightbox: повторный жест закрывает; на touch — любой тап).
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
    const dialogRef = useRef<HTMLDivElement>(null);
    const openButtonRef = useRef<HTMLButtonElement>(null);
    /** Игнор жеста, который только что открыл лайтбокс (mobile ghost tap). */
    const openedAtRef = useRef(0);
    /** Игнор click после touch-close, чтобы не открыть снова. */
    const closedAtRef = useRef(0);

    const close = useCallback(() => {
        closedAtRef.current = Date.now();
        setIsOpen(false);
    }, []);

    const open = useCallback(() => {
        // После touch-close синтетический click не должен сразу открыть снова.
        if (Date.now() - closedAtRef.current < 400) {
            return;
        }
        openedAtRef.current = Date.now();
        setIsOpen(true);
    }, []);

    const dismissFromPointer = useCallback(() => {
        if (Date.now() - openedAtRef.current < 280) {
            return;
        }
        close();
    }, [close]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        dialogRef.current?.focus();

        const onKeyDown = (event: KeyboardEvent) => {
            if (!isDismissKey(event.key)) {
                return;
            }
            event.preventDefault();
            close();
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
                        onClick={open}
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
                    ref={dialogRef}
                    className={[
                        'fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center',
                        'px-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]',
                        'pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]',
                        'sm:px-6 sm:py-6',
                        // Не foreground: в dark он светлый → «молочная» вуаль.
                        // Чёрный scrim в обеих темах (как у медиа-лайтбоксов).
                        'bg-black/55 backdrop-blur-[3px]',
                        'dark:bg-black/80 dark:backdrop-blur-[5px]',
                        'focus:outline-none',
                    ].join(' ')}
                    role="dialog"
                    aria-modal="true"
                    aria-label={closeLabel}
                    aria-describedby={titleId}
                    tabIndex={-1}
                    // Desktop: клик. Mobile: pointerdown = любой тап сразу закрывает.
                    onClick={dismissFromPointer}
                    onPointerDown={(event) => {
                        // touch / pen — закрываем на down (интуитивный «тап = закрыть»).
                        if (event.pointerType === 'mouse') {
                            return;
                        }
                        // Блокируем совместимый click, иначе после unmount откроется снова.
                        event.preventDefault();
                        dismissFromPointer();
                    }}
                >
                    <p id={titleId} className="sr-only">
                        {alt}
                    </p>

                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={resolvedSrc}
                        alt={alt}
                        draggable={false}
                        className={[
                            'relative z-10 mx-auto h-auto w-auto max-w-full object-contain',
                            'max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)]',
                            'rounded-md bg-black/20 shadow-2xl shadow-black/40',
                            'ring-1 ring-white/10',
                            'pointer-events-none select-none',
                            pixelArt ? '[image-rendering:pixelated]' : '',
                        ].join(' ')}
                    />
                </div>
            ) : null}
        </>
    );
}
