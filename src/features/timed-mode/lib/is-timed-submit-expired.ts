/**
 * Проверка: опоздал ли Timed submit относительно серверного дедлайна.
 *
 * Pure function — без Neon / Prisma. Авторитет часов: `timedEndsAt` из БД +
 * `nowMs` с сервера в Server Action (не из FormData).
 * Classic/daily (`timedEndsAt` null) → никогда не «expired».
 * Canon: docs/DECISIONS.md → Timed Mode MVP; grace = TIMED_MODE_MVP_RULES.graceSeconds.
 */

import { TIMED_MODE_MVP_RULES } from '@/features/timed-mode/types';

export function isTimedSubmitExpired(
    timedEndsAt: Date | string | null | undefined,
    nowMs: number = Date.now(),
    graceSeconds: number = TIMED_MODE_MVP_RULES.graceSeconds,
): boolean {
    if (timedEndsAt == null) {
        return false;
    }

    const endsAtMs =
        timedEndsAt instanceof Date
            ? timedEndsAt.getTime()
            : new Date(timedEndsAt).getTime();

    if (Number.isNaN(endsAtMs)) {
        // Битый дедлайн у timed-сессии — не даём «пройти» без проверки.
        return true;
    }

    return nowMs > endsAtMs + graceSeconds * 1000;
}
