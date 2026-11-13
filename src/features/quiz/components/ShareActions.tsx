'use client';

/**
 * Строка «Поделиться» + прямые ссылки Telegram, VK и MAX.
 *
 * Кнопка: на телефоне (pointer: coarse) — системное меню Web Share API
 * (там и MAX, и любые установленные мессенджеры); на компьютере — текст в
 * буфер и тост. Ссылки мессенджеров нужны прежде всего на компьютере, где
 * системного меню нет или оно неудобное.
 * Общая для «Поделиться результатом» и «Вызова другу»: текст и ссылки
 * собирает вызывающий. Canon: docs/DECISIONS.md → Share result.
 */

import type { ShareTargets } from '@/features/quiz/lib/build-result-share';
import type { AnalyticsShareWhat } from '@/shared/analytics/events';
import { track } from '@/shared/analytics/track';
import { buttonClassName } from '@/shared/ui/button';
import { toastError, toastSuccess } from '@/shared/ui/toast';

type ShareActionsProps = {
    /** Полный текст со ссылкой — для системного меню и буфера. */
    text: string;
    targets: ShareTargets;
    labels: { button: string; copied: string; copyFailed: string };
    /** Для воронки 3.5: делятся результатом или ссылкой вызова. */
    shareWhat: AnalyticsShareWhat;
    className?: string;
};

function ShareMark() {
    return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden className="shrink-0">
            <path
                d="M8 10V2.5M5 5.5l3-3 3 3M3.5 9v4h9V9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

const TARGET_LINKS = [
    { key: 'telegram', label: 'Telegram' },
    { key: 'vk', label: 'VK' },
    { key: 'max', label: 'MAX' },
] as const;

export function ShareActions({
    text,
    targets,
    labels,
    shareWhat,
    className = '',
}: ShareActionsProps) {
    async function handleShare() {
        track({ name: 'share_click', props: { what: shareWhat, via: 'button' } });

        const prefersSystemSheet =
            window.matchMedia('(pointer: coarse)').matches &&
            typeof navigator.share === 'function';

        if (prefersSystemSheet) {
            try {
                await navigator.share({ text });
                return;
            } catch (error) {
                // Игрок закрыл меню — это не ошибка.
                if (error instanceof DOMException && error.name === 'AbortError') {
                    return;
                }
            }
        }

        try {
            await navigator.clipboard.writeText(text);
            toastSuccess(labels.copied);
        } catch {
            toastError(labels.copyFailed);
        }
    }

    return (
        <div
            className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 ${className}`}
        >
            <button
                type="button"
                onClick={handleShare}
                className={buttonClassName({
                    variant: 'secondary',
                    className: 'w-full gap-2 sm:w-auto',
                })}
            >
                <ShareMark />
                {labels.button}
            </button>
            <div role="group" aria-label={labels.button} className="grid grid-cols-3 gap-2 sm:flex">
                {TARGET_LINKS.map((target) => (
                    <a
                        key={target.key}
                        href={targets[target.key]}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() =>
                            track({
                                name: 'share_click',
                                props: { what: shareWhat, via: target.key },
                            })
                        }
                        className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-surface px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                        {target.label}
                    </a>
                ))}
            </div>
        </div>
    );
}
