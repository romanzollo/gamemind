/**
 * Компактная карточка режима на главной (П2: «карточка — обещание, настройки —
 * потом»): название, строка правил, стрелка. Касание открывает шторку с
 * описанием и настройками (`children` — форма старта или приглашение войти).
 *
 * Presentation only: старт, валидация и горячий путь — в формах режимов.
 */
'use client';

import { useId, useRef, type ReactNode } from 'react';

import { BottomSheet } from '@/shared/ui';

type ModeSheetCardProps = {
    title: string;
    /** Одна строка «правило · цифры» на карточке. */
    summary: string;
    description: string;
    /** Мелкая строка под описанием в шторке (например, про рейтинг). */
    hint?: string;
    closeLabel: string;
    /** data-testid корня: e2e открывает карточку и жмёт чипы внутри. */
    testId?: string;
    children: ReactNode;
};

export function ModeSheetCard({
    title,
    summary,
    description,
    hint,
    closeLabel,
    testId,
    children,
}: ModeSheetCardProps) {
    const sheetRef = useRef<HTMLDialogElement>(null);
    const headingId = useId();

    return (
        <div data-testid={testId}>
            <button
                type="button"
                aria-haspopup="dialog"
                data-testid="mode-open"
                onClick={() => sheetRef.current?.showModal()}
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3.5 text-left shadow-sm transition hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:px-5 sm:py-4"
            >
                <span className="min-w-0 flex-1">
                    <span className="block font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                        {title}
                    </span>
                    <span className="mt-0.5 block font-mono text-xs leading-snug text-muted">
                        {summary}
                    </span>
                </span>
                <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-5 shrink-0 text-muted"
                >
                    <path d="M9 6l6 6-6 6" />
                </svg>
            </button>

            <BottomSheet
                ref={sheetRef}
                labelledBy={headingId}
                closeLabel={closeLabel}
            >
                <h2
                    id={headingId}
                    className="pr-10 font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
                >
                    {title}
                </h2>
                <p className="mt-1.5 max-w-prose text-sm leading-snug text-muted">
                    {description}
                </p>
                {hint ? (
                    <p className="mt-1.5 max-w-prose text-xs leading-snug text-muted">
                        {hint}
                    </p>
                ) : null}
                <div className="mt-5">{children}</div>
            </BottomSheet>
        </div>
    );
}
