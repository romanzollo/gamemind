/**
 * Unlock toast: своя вёрстка (не icon-slot Sonner) + i18n с pathname.
 *
 * Почему custom:
 * - слот `[data-icon]` у Sonner ~16px и ломает крупный AchievementMark (текст наезжает);
 * - строки не «запекаем» при показе — читаем dictionary по locale из URL,
 *   поэтому RU↔EN обновляет уже открытый toast.
 *
 * Canon: DECISIONS → Toast Notifications MVP.
 */
'use client';

import { usePathname } from 'next/navigation';
import { toast } from 'sonner';

import { AchievementMark } from '@/features/achievements/components/AchievementMark';
import type { AchievementCode } from '@/features/achievements/types';
import {
    defaultLocale,
    getDictionary,
    getLocaleFromPathname,
} from '@/shared/i18n';
import { MAX_INDIVIDUAL_ACHIEVEMENT_TOASTS } from '@/shared/ui/toast';

const STAGGER_MS = 140;

function useToastDictionary() {
    const pathname = usePathname();
    const locale = getLocaleFromPathname(pathname) ?? defaultLocale;
    return getDictionary(locale);
}

type AchievementUnlockToastCardProps = {
    code: AchievementCode;
    toastId: string | number;
};

function AchievementUnlockToastCard({
    code,
    toastId,
}: AchievementUnlockToastCardProps) {
    const dictionary = useToastDictionary();
    const labels = dictionary.achievements;
    const copy = labels.items[code];

    return (
        <div
            className="relative flex w-[min(100vw-2rem,20rem)] items-start gap-3 rounded-md border border-border border-l-4 border-l-primary bg-surface p-3 pr-9 text-foreground shadow-md"
            role="status"
        >
            <AchievementMark code={code} unlocked size="sm" />

            <div className="min-w-0 flex-1 pt-0.5">
                <p className="font-display text-sm font-semibold leading-snug tracking-tight text-foreground">
                    {copy.title}
                </p>
                <p className="mt-0.5 text-xs leading-snug text-muted">
                    {labels.toastUnlocked}
                </p>
            </div>

            <button
                type="button"
                onClick={() => toast.dismiss(toastId)}
                className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md border border-border bg-surface text-muted transition hover:bg-surface-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                aria-label={dictionary.notifications.closeToast}
            >
                <span aria-hidden className="text-sm leading-none">
                    ×
                </span>
            </button>
        </div>
    );
}

type AchievementMoreToastCardProps = {
    remaining: number;
    toastId: string | number;
};

function AchievementMoreToastCard({
    remaining,
    toastId,
}: AchievementMoreToastCardProps) {
    const dictionary = useToastDictionary();
    const labels = dictionary.achievements;

    return (
        <div
            className="relative flex w-[min(100vw-2rem,20rem)] items-start rounded-md border border-border border-l-4 border-l-info bg-surface p-3 pr-9 text-foreground shadow-md"
            role="status"
        >
            <p className="min-w-0 flex-1 text-sm leading-snug text-foreground">
                {labels.toastMoreSummary.replace('{count}', String(remaining))}
            </p>
            <button
                type="button"
                onClick={() => toast.dismiss(toastId)}
                className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md border border-border bg-surface text-muted transition hover:bg-surface-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                aria-label={dictionary.notifications.closeToast}
            >
                <span aria-hidden className="text-sm leading-none">
                    ×
                </span>
            </button>
        </div>
    );
}

/**
 * Показывает unlock-тосты по кодам (display-only).
 * Тексты локализуются внутри card через pathname.
 */
export function showAchievementUnlockToasts(codes: AchievementCode[]): void {
    if (codes.length === 0) {
        return;
    }

    const shown = codes.slice(0, MAX_INDIVIDUAL_ACHIEVEMENT_TOASTS);
    const remaining = codes.length - shown.length;

    shown.forEach((code, index) => {
        window.setTimeout(() => {
            toast.custom(
                (toastId) => (
                    <AchievementUnlockToastCard
                        code={code}
                        toastId={toastId}
                    />
                ),
                {
                    duration: 5200,
                    unstyled: true,
                    className: 'relative',
                },
            );
        }, index * STAGGER_MS);
    });

    if (remaining > 0) {
        window.setTimeout(() => {
            toast.custom(
                (toastId) => (
                    <AchievementMoreToastCard
                        remaining={remaining}
                        toastId={toastId}
                    />
                ),
                {
                    duration: 5200,
                    unstyled: true,
                    className: 'relative',
                },
            );
        }, shown.length * STAGGER_MS);
    }
}
