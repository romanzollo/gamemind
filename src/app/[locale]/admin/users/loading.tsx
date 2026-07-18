export default function AdminUsersLoading() {
    return (
        <main className="mx-auto max-w-5xl p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="h-8 w-64 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
                <div className="h-9 w-28 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
            </div>

            <div className="mt-2 h-4 w-72 animate-pulse rounded bg-neutral-100 dark:bg-neutral-900" />
            <div className="mt-1 h-4 w-96 animate-pulse rounded bg-neutral-100 dark:bg-neutral-900" />

            <div className="mt-6 overflow-hidden rounded border border-border">
                <div className="h-10 border-b border-border bg-neutral-50 dark:bg-neutral-900" />
                {Array.from({ length: 6 }).map((_, index) => (
                    <div
                        key={index}
                        className="h-12 border-b border-border bg-neutral-100/80 dark:bg-neutral-950/80 last:border-b-0"
                    />
                ))}
            </div>
        </main>
    );
}
