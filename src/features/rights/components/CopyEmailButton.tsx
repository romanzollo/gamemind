'use client';

/**
 * Кнопка «Скопировать адрес» рядом с mailto на /rights.
 *
 * Клиентская: нужен буфер обмена. Без доступа к буферу (старый браузер,
 * запрет) — тост об ошибке; адрес остаётся виден на кнопке mailto.
 */

import { toastError, toastSuccess } from '@/shared/ui/toast';

type CopyEmailButtonProps = {
    email: string;
    labels: { copyLabel: string; copied: string; copyFailed: string };
};

export function CopyEmailButton({ email, labels }: CopyEmailButtonProps) {
    async function handleCopy() {
        try {
            await navigator.clipboard.writeText(email);
            toastSuccess(labels.copied);
        } catch {
            toastError(labels.copyFailed);
        }
    }

    return (
        <button
            type="button"
            onClick={handleCopy}
            aria-label={labels.copyLabel}
            title={labels.copyLabel}
            className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md border border-border bg-surface text-foreground transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
            <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <rect x="8" y="8" width="12" height="12" rx="2" />
                <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
            </svg>
        </button>
    );
}
