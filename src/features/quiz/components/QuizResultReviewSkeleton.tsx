/**
 * Skeleton разбора, пока Neon/review грузится в Suspense.
 */

export function QuizResultReviewSkeleton() {
    return (
        <div
            className="mt-8 animate-pulse border-t border-border pt-6 sm:mt-10 sm:pt-8"
            aria-hidden
        >
            <div className="h-7 w-40 rounded-md bg-surface-muted" />
            <div className="mt-4 space-y-3">
                <div className="h-24 rounded-lg bg-surface-muted" />
                <div className="h-24 rounded-lg bg-surface-muted" />
            </div>
        </div>
    );
}
