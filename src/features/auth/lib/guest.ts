/**
 * Гость (3.4): общие константы для страницы регистрации и стартовых
 * actions режимов. Canon: docs/DECISIONS.md → Accounts without a password.
 */

import type { Locale } from '@/shared/i18n';

/** `?reason=` на регистрации: гостя не пустили в Блиц / Выживание. */
export const GUEST_MODES_LOCKED_REASON = 'guest-modes';

/** Куда отправить гостя из Блица / Выживания: там рейтинг, нужен аккаунт. */
export function guestModesLockedHref(locale: Locale): string {
    return `/${locale}/register?reason=${GUEST_MODES_LOCKED_REASON}`;
}
