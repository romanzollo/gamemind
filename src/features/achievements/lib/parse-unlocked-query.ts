/**
 * Flash-query `?unlocked=` для celebration toast после квиза.
 *
 * Query — только display hint после redirect. Источник правды unlock = БД
 * (`UserAchievement`). Невалидные/неизвестные коды отбрасываем (не toast’им).
 *
 * Canon: docs/DECISIONS.md → Toast Notifications MVP.
 */

import {
    ACHIEVEMENT_CATALOG,
    type AchievementCode,
} from '@/features/achievements/types';

const ACHIEVEMENT_CODE_SET: ReadonlySet<string> = new Set(
    ACHIEVEMENT_CATALOG.map((item) => item.code),
);

export function isAchievementCode(value: string): value is AchievementCode {
    return ACHIEVEMENT_CODE_SET.has(value);
}

/**
 * Разбирает сырой searchParam `unlocked` в список известных кодов.
 * Дедуп сохраняет порядок первого появления.
 */
export function parseUnlockedQuery(
    raw: string | string[] | undefined,
): AchievementCode[] {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value !== 'string' || value.trim() === '') {
        return [];
    }

    const seen = new Set<AchievementCode>();
    const codes: AchievementCode[] = [];

    for (const part of value.split(',')) {
        const code = part.trim();
        if (!isAchievementCode(code) || seen.has(code)) {
            continue;
        }
        seen.add(code);
        codes.push(code);
    }

    return codes;
}

/**
 * Суффикс URL после result path: `?unlocked=A,B` или пустая строка.
 * Пустой список → без query (обычный result URL).
 */
export function buildUnlockedQuerySuffix(
    codes: readonly AchievementCode[],
): string {
    if (codes.length === 0) {
        return '';
    }

    return `?unlocked=${codes.join(',')}`;
}
