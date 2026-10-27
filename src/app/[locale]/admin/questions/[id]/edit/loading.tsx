export default function AdminEditQuestionLoading() {
    return (
        <main className="mx-auto max-w-4xl px-4 py-5 sm:px-8 sm:py-10">
            <div className="h-8 w-64 animate-pulse rounded bg-surface-muted" />

            <div className="mt-6 flex flex-col gap-4">
                <div className="h-24 animate-pulse rounded border border-border bg-surface-muted/60" />
                <div className="h-24 animate-pulse rounded border border-border bg-surface-muted/60" />
                <div className="h-12 animate-pulse rounded border border-border bg-surface-muted/60" />
                <div className="h-12 animate-pulse rounded border border-border bg-surface-muted/60" />

                {Array.from({ length: 4 }).map((_, index) => (
                    <div
                        key={index}
                        className="h-32 animate-pulse rounded border border-border bg-surface-muted/60"
                    />
                ))}

                <div className="h-10 w-40 animate-pulse rounded bg-surface-muted" />
            </div>
        </main>
    );
}
