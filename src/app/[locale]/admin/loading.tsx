export default function AdminHomeLoading() {
    return (
        <main className="mx-auto max-w-5xl p-8">
            <div className="h-8 w-48 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
            <div className="mt-2 h-4 w-72 animate-pulse rounded bg-neutral-100 dark:bg-neutral-900" />
            <div className="mt-1 h-4 w-96 animate-pulse rounded bg-neutral-100 dark:bg-neutral-900" />

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="h-36 animate-pulse rounded-lg border border-border bg-neutral-100 dark:bg-neutral-900" />
                <div className="h-36 animate-pulse rounded-lg border border-border bg-neutral-100 dark:bg-neutral-900" />
            </div>
        </main>
    );
}
