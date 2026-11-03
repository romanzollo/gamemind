/**
 * Шторка поверх страницы: на телефоне выезжает снизу, с `sm` — окно по центру.
 *
 * Основа — нативный `<dialog>` + `showModal()`: фокус внутри, Esc, затемнение
 * (`::backdrop`) и возврат фокуса на кнопку-открыватель даёт браузер, без
 * своего фокус-трапа и без зависимостей. Открывает родитель через `ref`
 * (`ref.current?.showModal()`) — состояние «открыто» живёт в DOM, а не в React.
 * Прокрутку страницы под шторкой блокирует правило в `globals.css`.
 */
'use client';

import type { MouseEvent, ReactNode, Ref } from 'react';

type BottomSheetProps = {
    ref: Ref<HTMLDialogElement>;
    /** id заголовка внутри children — для `aria-labelledby`. */
    labelledBy: string;
    closeLabel: string;
    children: ReactNode;
};

function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>) {
    // Клик по самому <dialog> = клик по затемнению: содержимое лежит во
    // внутреннем блоке, поэтому target совпадает с dialog только снаружи него.
    if (event.target === event.currentTarget) {
        event.currentTarget.close();
    }
}

export function BottomSheet({
    ref,
    labelledBy,
    closeLabel,
    children,
}: BottomSheetProps) {
    return (
        <dialog
            ref={ref}
            aria-labelledby={labelledBy}
            onClick={closeOnBackdrop}
            className="mx-0 mt-auto mb-0 max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-2xl border border-b-0 border-border bg-surface-raised p-0 text-foreground shadow-lg backdrop:bg-black/50 sm:m-auto sm:max-w-md sm:rounded-2xl sm:border-b"
        >
            <div className="relative px-4 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-6 sm:pb-6">
                {/* type="button", не <form method="dialog">: единственный
                    submit в шторке — старт режима (на него опирается e2e). */}
                <button
                    type="button"
                    aria-label={closeLabel}
                    onClick={(event) =>
                        event.currentTarget.closest('dialog')?.close()
                    }
                    className="absolute top-3 right-3 flex size-10 items-center justify-center rounded-full text-muted transition hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                    <svg
                        aria-hidden
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        className="size-5"
                    >
                        <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                </button>
                {children}
            </div>
        </dialog>
    );
}
