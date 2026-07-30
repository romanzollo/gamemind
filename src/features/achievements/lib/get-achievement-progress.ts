/**
 * Progress ачивок для профиля: catch-up award + каталог + даты unlock.
 *
 * Зачем: старые QuizResult (до фичи) получат бейджи при открытии профиля;
 * UI всегда видит полный каталог (locked / unlocked), не только строки БД.
 */

import { userAchievementRepository } from '@/entities/user-achievement/user-achievement.repository';
import { awardAchievementsForUser } from '@/features/achievements/lib/award-achievements-for-user';
import {
    ACHIEVEMENT_CATALOG,
    type AchievementProgress,
} from '@/features/achievements/types';

/**
 * null = не удалось прочитать unlock после catch-up (UI покажет loadFailed).
 * Объект всегда содержит все MVP-коды в порядке каталога.
 */
export async function getAchievementProgressForUser(
    userId: string,
): Promise<AchievementProgress | null> {
    // Soft-fail catch-up: ошибка award не должна ломать чтение прогресса.
    await awardAchievementsForUser(userId);

    try {
        const unlockRows =
            await userAchievementRepository.findUnlockRowsByUserId(userId);
        const unlockedAtByCode = new Map(
            unlockRows.map((row) => [row.code, row.unlockedAt] as const),
        );

        return {
            items: ACHIEVEMENT_CATALOG.map((definition) => ({
                code: definition.code,
                unlockedAt: unlockedAtByCode.get(definition.code) ?? null,
            })),
        };
    } catch (error) {
        console.error('Achievement progress load failed:', error);
        return null;
    }
}
