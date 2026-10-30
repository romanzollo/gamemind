/**
 * Unlock toast: своя вёрстка (не icon-slot Sonner) + i18n с pathname.
 *
 * Почему custom:
 * - слот `[data-icon]` у Sonner ~16px и ломает крупный AchievementMark (текст наезжает);
 * - строки не «запекаем» при показе — читаем dictionary по locale из URL,
 *   поэтому RU↔EN обновляет уже открытый toast.
 *
 * Празднование: полоса и подпись цветом уровня редкости, «прыжок» значка
 * (motion-safe), ссылка в профиль с `?unlocked=` — там новые плитки вспыхнут.
 *
 * Canon: DECISIONS → Toast Notifications MVP; Achievements (tiers, unlock flash).
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';

import { AchievementMark } from '@/features/achievements/components/AchievementMark';
import { ACHIEVEMENT_TIER_CLASS_NAMES } from '@/features/achievements/components/achievement-tier-styles';
import { buildUnlockedQuerySuffix } from '@/features/achievements/lib/parse-unlocked-query';
import {
    ACHIEVEMENT_TIER,
    type AchievementCode,
} from '@/features/achievements/types';
import {
    defaultLocale,
    getDictionary,
    getLocaleFromPathname,
} from '@/shared/i18n';
import { MAX_INDIVIDUAL_ACHIEVEMENT_TOASTS } from '@/shared/ui/toast';

const STAGGER_MS = 140;

function useToastLocale() {
    const pathname = usePathname();
    const locale = getLocaleFromPathname(pathname) ?? defaultLocale;
    return { locale, dictionary: getDictionary(locale) };
}

/** Профиль с кодами этого показа — вспышка новых плиток (display-only). */
function profileHref(locale: string, codes: readonly AchievementCode[]) {
    return `/${locale}/profile${buildUnlockedQuerySuffix(codes)}`;
}

const closeButtonClassName =
    'absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md border border-border bg-surface text-muted transition hover:bg-surface-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

const profileLinkClassName =
    'mt-1.5 inline-block text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

type AchievementUnlockToastCardProps = {
    code: AchievementCode;
    /** Все коды показа — ссылка в профиль подсветит их вместе. */
    allCodes: readonly AchievementCode[];
    toastId: string | number;
};

function AchievementUnlockToastCard({
    code,
    allCodes,
    toastId,
}: AchievementUnlockToastCardProps) {
    const { locale, dictionary } = useToastLocale();
    const labels = dictionary.achievements;
    const copy = labels.items[code];
    const tier = ACHIEVEMENT_TIER[code];

    return (
        <div
            className={`relative flex w-[min(100vw-2rem,20rem)] items-start gap-3 rounded-md border border-border border-l-4 ${ACHIEVEMENT_TIER_CLASS_NAMES[tier].stripe} bg-surface p-3 pr-9 text-foreground shadow-md`}
            role="status"
        >
            <AchievementMark
                code={code}
                unlocked
                size="sm"
                className="motion-safe:animate-[gm-achievement-pop_420ms_cubic-bezier(0.22,1,0.36,1)_both]"
            />

            <div className="min-w-0 flex-1 pt-0.5">
                <p className="font-display text-sm font-semibold leading-snug tracking-tight text-foreground">
                    {copy.title}
                </p>
                <p className="mt-0.5 text-xs leading-snug text-muted">
                    {labels.tiers[tier]} · {labels.toastUnlocked}
                </p>
                <Link
                    href={profileHref(locale, allCodes)}
                    onClick={() => toast.dismiss(toastId)}
                    className={profileLinkClassName}
                >
                    {labels.toastViewProfile}
                </Link>
            </div>

            <button
                type="button"
                onClick={() => toast.dismiss(toastId)}
                className={closeButtonClassName}
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
    allCodes: readonly AchievementCode[];
    toastId: string | number;
};

function AchievementMoreToastCard({
    remaining,
    allCodes,
    toastId,
}: AchievementMoreToastCardProps) {
    const { locale, dictionary } = useToastLocale();
    const labels = dictionary.achievements;

    return (
        <div
            className="relative flex w-[min(100vw-2rem,20rem)] items-start rounded-md border border-border border-l-4 border-l-info bg-surface p-3 pr-9 text-foreground shadow-md"
            role="status"
        >
            <Link
                href={profileHref(locale, allCodes)}
                onClick={() => toast.dismiss(toastId)}
                className="min-w-0 flex-1 text-sm leading-snug text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
                {labels.toastMoreSummary.replace('{count}', String(remaining))}
            </Link>
            <button
                type="button"
                onClick={() => toast.dismiss(toastId)}
                className={closeButtonClassName}
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
                        allCodes={codes}
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
                        allCodes={codes}
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
