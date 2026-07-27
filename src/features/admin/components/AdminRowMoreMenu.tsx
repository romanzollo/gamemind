'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * Компактное «Ещё»-меню для desktop admin row.
 *
 * Зачем: в content-queue нельзя держать 4–6 текстовых actions в одной ячейке —
 * снаружи только Edit (стабильная колонка), редкие и статусные действия сюда.
 *
 * Почему `<details>`, а не library: один disclosure без Radix/Headless —
 * Scoreboard Editorial, без второго UI-стека (см. TASTE §14).
 * Client нужен только для Escape / click-outside; open/close даёт браузер.
 *
 * Важно: outside-close на `click`, не `pointerdown` — иначе pointerdown
 * может сорвать submit Server Action у кнопок внутри панели.
 *
 * Не использовать role="menu": внутри Server Action forms, не menuitem-паттерн.
 */

type AdminRowMoreMenuProps = {
    /** Подпись для screen readers + title (из dictionary.admin.rowMoreActions). */
    label: string;
    children: ReactNode;
};

export function AdminRowMoreMenu({ label, children }: AdminRowMoreMenuProps) {
    const detailsRef = useRef<HTMLDetailsElement>(null);
    const panelId = useId();

    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            if (event.key !== 'Escape') {
                return;
            }
            const el = detailsRef.current;
            if (el?.open) {
                el.open = false;
            }
        }

        // click (не pointerdown): submit button должен успеть получить полный click.
        function onDocumentClick(event: MouseEvent) {
            const el = detailsRef.current;
            if (!el?.open) {
                return;
            }
            if (event.target instanceof Node && !el.contains(event.target)) {
                el.open = false;
            }
        }

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('click', onDocumentClick);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('click', onDocumentClick);
        };
    }, []);

    return (
        <details ref={detailsRef} className="relative inline-block">
            <summary
                className="inline-flex min-h-8 cursor-pointer list-none items-center rounded-sm px-1.5 font-mono text-sm font-medium text-muted motion-safe:transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden"
                aria-controls={panelId}
                title={label}
            >
                <span className="sr-only">{label}</span>
                <span aria-hidden="true">⋯</span>
            </summary>

            <div
                id={panelId}
                className="absolute right-0 z-20 mt-1 min-w-44 rounded-md border border-border bg-surface p-1.5 shadow-md"
                onClick={(event) => {
                    // Не даём клику всплыть к summary/details и случайно toggle.
                    event.stopPropagation();
                }}
            >
                <div className="flex flex-col items-stretch gap-0.5">{children}</div>
            </div>
        </details>
    );
}
