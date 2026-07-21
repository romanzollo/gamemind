import type { HTMLAttributes } from 'react';

type SkeletonProps = HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className = '', ...props }: SkeletonProps) {
    return (
        <div
            className={`animate-pulse rounded-md bg-surface-muted ${className}`.trim()}
            {...props}
        />
    );
}

/** Generic page placeholder matching main content width */
export function PageSkeleton({
    variant = 'default',
}: {
    variant?: 'default' | 'form' | 'table' | 'quiz';
}) {
    if (variant === 'form') {
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

    if (variant === 'table') {
        return (
            <main
                className="mx-auto max-w-5xl px-4 py-6 sm:p-8"
                aria-busy="true"
                aria-live="polite"
            >
                <Skeleton className="h-8 w-56" />
                <Skeleton className="mt-2 h-4 w-80 max-w-full" />
                <div className="mt-8 space-y-3">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                </div>
            </main>
        );
    }

    if (variant === 'quiz') {
        return (
            <main
                className="mx-auto max-w-2xl px-4 py-5 sm:px-8 sm:py-10"
                aria-busy="true"
                aria-live="polite"
            >
                <Skeleton className="h-8 w-40" />
                <Skeleton className="mt-4 h-14 w-full rounded-lg" />
                <div className="mt-6 space-y-4">
                    <Skeleton className="h-40 w-full rounded-lg" />
                    <Skeleton className="h-40 w-full rounded-lg" />
                </div>
            </main>
        );
    }

    return (
        <main
            className="mx-auto max-w-5xl px-4 py-6 sm:p-8"
            aria-busy="true"
            aria-live="polite"
        >
            <Skeleton className="h-9 w-64 max-w-full" />
            <Skeleton className="mt-3 h-4 w-96 max-w-full" />
            <Skeleton className="mt-8 h-32 w-full rounded-lg" />
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <Skeleton className="h-24 w-full rounded-lg" />
                <Skeleton className="h-24 w-full rounded-lg" />
            </div>
        </main>
    );
}
