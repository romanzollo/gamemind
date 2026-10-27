import type { ReactNode } from 'react';

type StatusPageProps = {
    /** Табличный «счёт» над заголовком (например `404`). */
    eyebrow?: string;
    title: string;
    description: string;
    /** CTA-ряд: первый — primary, остальные — secondary. */
    actions: ReactNode;
    /** Мелкая строка под CTA (например digest ошибки для поддержки). */
    footnote?: ReactNode;
};

/**
 * Полноэкранное состояние страницы: 404 и error boundaries.
 *
 * Без hooks и без dictionary — тексты передаёт вызывающий
 * (`[locale]/not-found`, `[locale]/error`, `global-error`), поэтому
 * годится и в Client, и в Server Components.
 * Scoreboard Editorial: mono-eyebrow, Oswald-заголовок, muted-текст;
 * не путать с EmptyState (пустой список — не ошибка).
 */
export function StatusPage({
    eyebrow,
    title,
    description,
    actions,
    footnote,
}: StatusPageProps) {
    return (
        <main className="mx-auto flex w-full max-w-2xl flex-col px-4 py-12 sm:px-8 sm:py-20">
            {eyebrow ? (
                <p className="font-display text-6xl font-semibold tracking-tight text-muted tabular-nums sm:text-7xl">
                    {eyebrow}
                </p>
            ) : null}

            <h1
                className={`${eyebrow ? 'mt-4' : ''} font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl`.trim()}
            >
                {title}
            </h1>

            <p className="mt-4 max-w-lg text-pretty text-base leading-relaxed text-muted">
                {description}
            </p>

            <div className="mt-8 flex flex-wrap gap-2">{actions}</div>

            {footnote ? (
                <p className="mt-6 font-mono text-[0.65rem] font-medium uppercase tracking-[0.14em] text-muted">
                    {footnote}
                </p>
            ) : null}
        </main>
    );
}
