export default function AdminHomeLoading() {
    return (
        <main className="mx-auto max-w-5xl px-4 py-5 sm:px-8 sm:py-10">
            <div className="h-8 w-48 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
            <div className="mt-2 h-4 w-72 animate-pulse rounded bg-neutral-100 dark:bg-neutral-900" />
            <div className="mt-1 h-4 w-96 max-w-full animate-pulse rounded bg-neutral-100 dark:bg-neutral-900" />

            <div className="mt-5 h-16 animate-pulse border border-border border-l-4 border-l-primary bg-neutral-100 dark:bg-neutral-900" />

            <div className="mt-5 grid gap-3 sm:mt-6 sm:grid-cols-2 sm:gap-4">
                <div className="min-h-52 animate-pulse rounded-lg border border-border bg-neutral-100 dark:bg-neutral-900 sm:min-h-56" />
                <div className="min-h-52 animate-pulse rounded-lg border border-border bg-neutral-100 dark:bg-neutral-900 sm:min-h-56" />
            </div>
        </main>
    );
}
