'use client';

import {
    useCallback,
    useEffect,
    useId,
    useRef,
    useState,
    type MouseEvent,
    type PointerEvent,
} from 'react';

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

type Point = { x: number; y: number };

type Transform = {
    scale: number;
    x: number;
    y: number;
};

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const TAP_MOVE_PX = 12;
const ZOOMED_EPS = 1.02;

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

function distance(a: Point, b: Point) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
}

function midpoint(a: Point, b: Point): Point {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function clampScale(scale: number) {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/**
 * Промпт IMAGE_GUESS: полный кадр (object-contain) + лайтбокс.
 * Desktop: клик / Esc·Enter·Space·Backspace закрывают.
 * Mobile: pinch-zoom + pan на увеличенном кадре; одиночный тап закрывает
 * (если scale≈1) или сбрасывает zoom (если уже pinch).
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
    const stageRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const openButtonRef = useRef<HTMLButtonElement>(null);
    /** Игнор жеста, который только что открыл лайтбокс (mobile ghost tap). */
    const openedAtRef = useRef(0);
    /** Игнор click после touch-close, чтобы не открыть снова. */
    const closedAtRef = useRef(0);
    /** После touch pointerup браузер шлёт click — не закрывать повторно. */
    const suppressClickUntilRef = useRef(0);

    const transformRef = useRef<Transform>({ scale: 1, x: 0, y: 0 });
    const pointersRef = useRef<Map<number, Point>>(new Map());
    const pinchRef = useRef<{
        startDistance: number;
        startScale: number;
        startMid: Point;
        originX: number;
        originY: number;
    } | null>(null);
    const panRef = useRef<{
        start: Point;
        originX: number;
        originY: number;
    } | null>(null);
    const tapRef = useRef<{ start: Point; moved: boolean } | null>(null);
    const didPinchRef = useRef(false);

    const applyTransform = useCallback(() => {
        const node = imgRef.current;
        if (!node) {
            return;
        }
        const { scale, x, y } = transformRef.current;
        node.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    }, []);

    const resetTransform = useCallback(() => {
        transformRef.current = { scale: 1, x: 0, y: 0 };
        applyTransform();
    }, [applyTransform]);

    const close = useCallback(() => {
        closedAtRef.current = Date.now();
        resetTransform();
        pointersRef.current.clear();
        pinchRef.current = null;
        panRef.current = null;
        tapRef.current = null;
        didPinchRef.current = false;
        setIsOpen(false);
    }, [resetTransform]);

    const open = useCallback(() => {
        if (Date.now() - closedAtRef.current < 400) {
            return;
        }
        openedAtRef.current = Date.now();
        resetTransform();
        setIsOpen(true);
    }, [resetTransform]);

    const dismissIfIdle = useCallback(() => {
        if (Date.now() - openedAtRef.current < 280) {
            return;
        }
        if (transformRef.current.scale > ZOOMED_EPS) {
            resetTransform();
            return;
        }
        close();
    }, [close, resetTransform]);

    const onMouseDismissClick = useCallback(
        (event: MouseEvent<HTMLDivElement>) => {
            if (Date.now() < suppressClickUntilRef.current) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            dismissIfIdle();
        },
        [dismissIfIdle],
    );

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        dialogRef.current?.focus();
        resetTransform();

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
    }, [isOpen, close, resetTransform]);

    const onStagePointerDown = useCallback(
        (event: PointerEvent<HTMLDivElement>) => {
            if (event.pointerType === 'mouse') {
                return;
            }

            const point = { x: event.clientX, y: event.clientY };
            pointersRef.current.set(event.pointerId, point);
            stageRef.current?.setPointerCapture(event.pointerId);

            if (pointersRef.current.size >= 2) {
                didPinchRef.current = true;
                tapRef.current = null;
                panRef.current = null;
                const pts = [...pointersRef.current.values()];
                const [a, b] = pts;
                pinchRef.current = {
                    startDistance: Math.max(distance(a, b), 1),
                    startScale: transformRef.current.scale,
                    startMid: midpoint(a, b),
                    originX: transformRef.current.x,
                    originY: transformRef.current.y,
                };
                event.preventDefault();
                return;
            }

            tapRef.current = { start: point, moved: false };
            if (transformRef.current.scale > ZOOMED_EPS) {
                panRef.current = {
                    start: point,
                    originX: transformRef.current.x,
                    originY: transformRef.current.y,
                };
            }
        },
        [],
    );

    const onStagePointerMove = useCallback(
        (event: PointerEvent<HTMLDivElement>) => {
            if (event.pointerType === 'mouse') {
                return;
            }
            if (!pointersRef.current.has(event.pointerId)) {
                return;
            }

            pointersRef.current.set(event.pointerId, {
                x: event.clientX,
                y: event.clientY,
            });

            if (pointersRef.current.size >= 2 && pinchRef.current) {
                const pts = [...pointersRef.current.values()];
                const [a, b] = pts;
                const nextDistance = Math.max(distance(a, b), 1);
                const nextMid = midpoint(a, b);
                const pinch = pinchRef.current;
                const nextScale = clampScale(
                    pinch.startScale * (nextDistance / pinch.startDistance),
                );
                transformRef.current = {
                    scale: nextScale,
                    x: pinch.originX + (nextMid.x - pinch.startMid.x),
                    y: pinch.originY + (nextMid.y - pinch.startMid.y),
                };
                applyTransform();
                event.preventDefault();
                return;
            }

            const point = { x: event.clientX, y: event.clientY };
            if (tapRef.current) {
                const dx = point.x - tapRef.current.start.x;
                const dy = point.y - tapRef.current.start.y;
                if (Math.hypot(dx, dy) > TAP_MOVE_PX) {
                    tapRef.current.moved = true;
                }
            }

            if (panRef.current && transformRef.current.scale > ZOOMED_EPS) {
                const pan = panRef.current;
                transformRef.current = {
                    ...transformRef.current,
                    x: pan.originX + (point.x - pan.start.x),
                    y: pan.originY + (point.y - pan.start.y),
                };
                applyTransform();
                event.preventDefault();
            }
        },
        [applyTransform],
    );

    const onStagePointerUp = useCallback(
        (event: PointerEvent<HTMLDivElement>) => {
            if (event.pointerType === 'mouse') {
                return;
            }

            pointersRef.current.delete(event.pointerId);
            try {
                stageRef.current?.releasePointerCapture(event.pointerId);
            } catch {
                /* already released */
            }

            if (pointersRef.current.size < 2) {
                pinchRef.current = null;
            }
            if (pointersRef.current.size === 0) {
                panRef.current = null;

                const tap = tapRef.current;
                const wasPinch = didPinchRef.current;
                tapRef.current = null;
                didPinchRef.current = false;

                if (wasPinch) {
                    suppressClickUntilRef.current = Date.now() + 500;
                    if (transformRef.current.scale < ZOOMED_EPS) {
                        resetTransform();
                    }
                    return;
                }

                if (tap && !tap.moved) {
                    suppressClickUntilRef.current = Date.now() + 500;
                    dismissIfIdle();
                }
            }
        },
        [dismissIfIdle, resetTransform],
    );

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
                        'bg-black/55 backdrop-blur-[3px]',
                        'dark:bg-black/80 dark:backdrop-blur-[5px]',
                        'focus:outline-none',
                    ].join(' ')}
                    role="dialog"
                    aria-modal="true"
                    aria-label={closeLabel}
                    aria-describedby={titleId}
                    tabIndex={-1}
                    onClick={onMouseDismissClick}
                >
                    <p id={titleId} className="sr-only">
                        {alt}
                    </p>

                    <div
                        ref={stageRef}
                        className="relative z-10 flex h-full w-full touch-none items-center justify-center overflow-hidden"
                        onPointerDown={onStagePointerDown}
                        onPointerMove={onStagePointerMove}
                        onPointerUp={onStagePointerUp}
                        onPointerCancel={onStagePointerUp}
                        onClick={(event) => {
                            event.stopPropagation();
                            onMouseDismissClick(event);
                        }}
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            ref={imgRef}
                            src={resolvedSrc}
                            alt={alt}
                            draggable={false}
                            className={[
                                'relative mx-auto h-auto w-auto max-w-full origin-center object-contain',
                                'max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)]',
                                'rounded-md bg-black/20 shadow-2xl shadow-black/40',
                                'ring-1 ring-white/10',
                                'select-none will-change-transform',
                                pixelArt ? '[image-rendering:pixelated]' : '',
                            ].join(' ')}
                        />
                    </div>
                </div>
            ) : null}
        </>
    );
}
