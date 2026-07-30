/**
 * Тонкая обёртка над Sonner для GameMind.
 *
 * Зачем helpers, а не прямой `toast()` в фичах:
 * - один UX-язык (success / error / info);
 * - копирайт всегда приходит снаружи (i18n) — здесь нет RU/EN строк.
 *
 * Achievement unlock → `features/achievements/.../AchievementUnlockToast`
 * (custom layout + locale-aware copy), не этот модуль.
 *
 * Client-only: Sonner пишет в DOM. Не импортировать из Server Components /
 * Server Actions (передавайте flash через redirect query).
 *
 * Canon: docs/DECISIONS.md → Toast Notifications MVP.
 */
'use client';

import { toast } from 'sonner';

/** Сколько unlock-тостов показываем по одному; остальное — summary. */
export const MAX_INDIVIDUAL_ACHIEVEMENT_TOASTS = 3;

export function toastSuccess(message: string, description?: string): void {
    toast.success(message, {
        description,
        duration: 4000,
    });
}

export function toastError(message: string, description?: string): void {
    toast.error(message, {
        description,
        duration: 5000,
    });
}

export function toastInfo(message: string, description?: string): void {
    toast.message(message, {
        description,
        duration: 4000,
    });
}
