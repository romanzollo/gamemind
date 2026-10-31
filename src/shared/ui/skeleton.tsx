import type { HTMLAttributes } from 'react';

type SkeletonProps = HTMLAttributes<HTMLDivElement>;

/**
 * Примитив плейсхолдера. Скелетоны страниц собираются из него в своих
 * loading.tsx по форме конкретной страницы: общий шаблон другой ширины
 * и высоты при подмене давал «прыжок» вёрстки.
 */
export function Skeleton({ className = '', ...props }: SkeletonProps) {
    return (
        <div
            className={`animate-pulse rounded-md bg-surface-muted ${className}`.trim()}
            {...props}
        />
    );
}

/** Скелетон форм входа и регистрации (max-w-md). */
export function FormPageSkeleton() {
    return (
        <main
            className="mx-auto max-w-md px-4 py-6 sm:p-8"
            aria-busy="true"
            aria-live="polite"
        >
            <Skeleton className="h-8 w-48" />
            <div className="mt-6 space-y-3">
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-32" />
            </div>
        </main>
    );
}
