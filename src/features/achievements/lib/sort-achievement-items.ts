/**
 * Порядок плиток достижений в профиле.
 *
 * 1) только что открытые (пришли по ссылке из unlock-тоста, `?unlocked=`) —
 *    первыми, иначе на mobile они прячутся за «Показать все»;
 * 2) закрытые — мотивация «что ещё взять»;
 * 3) остальные открытые.
 * Внутри группы — порядок ACHIEVEMENT_CATALOG (сортировка стабильная).
 *
 * Чистая функция: без дат «сейчас» и без localStorage — легко тестировать.
 */

import type {
    AchievementCode,
    AchievementProgressItem,
} from '@/features/achievements/types';

function rank(
    item: AchievementProgressItem,
    highlighted: ReadonlySet<AchievementCode>,
): number {
    const unlocked = item.unlockedAt != null;
    // Ссылку можно подделать: наверх только реально открытые из `?unlocked=`.
    if (unlocked && highlighted.has(item.code)) {
        return 0;
    }

    return unlocked ? 2 : 1;
}

export function sortAchievementItemsForProfile(
    items: readonly AchievementProgressItem[],
    highlightedCodes: readonly AchievementCode[] = [],
): AchievementProgressItem[] {
    const highlighted = new Set(highlightedCodes);
    return [...items].sort(
        (a, b) => rank(a, highlighted) - rank(b, highlighted),
    );
}
