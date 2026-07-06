export default function AdminEditQuestionLoading() {
    return (
        <main className="mx-auto max-w-2xl p-8">
            <div className="h-8 w-64 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />

            <div className="mt-6 flex flex-col gap-4">
                <div className="h-24 animate-pulse rounded border border-border bg-neutral-100 dark:bg-neutral-900" />
                <div className="h-24 animate-pulse rounded border border-border bg-neutral-100 dark:bg-neutral-900" />
                <div className="h-12 animate-pulse rounded border border-border bg-neutral-100 dark:bg-neutral-900" />
                <div className="h-12 animate-pulse rounded border border-border bg-neutral-100 dark:bg-neutral-900" />

                {Array.from({ length: 4 }).map((_, index) => (
                    <div
                        key={index}
                        className="h-32 animate-pulse rounded border border-border bg-neutral-100 dark:bg-neutral-900"
                    />
                ))}

                <div className="h-10 w-40 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
            </div>
        </main>
    );
}
