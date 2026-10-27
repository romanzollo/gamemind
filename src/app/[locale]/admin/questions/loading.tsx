export default function AdminQuestionsLoading() {
    return (
        <main className="mx-auto max-w-5xl p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="h-8 w-56 animate-pulse rounded bg-surface-muted" />
                <div className="h-9 w-36 animate-pulse rounded bg-surface-muted" />
            </div>

            <div className="mt-2 h-4 w-72 animate-pulse rounded bg-surface-muted/60" />
            <div className="mt-1 h-4 w-96 animate-pulse rounded bg-surface-muted/60" />

            <div className="mt-6 overflow-hidden rounded border border-border">
                <div className="h-10 border-b border-border bg-surface-muted" />
                {Array.from({ length: 8 }).map((_, index) => (
                    <div
                        key={index}
                        className="h-12 border-b border-border bg-surface/80 last:border-b-0"
                    />
                ))}
            </div>
        </main>
    );
}
