/**
 * Progress ачивок для профиля: catch-up award + каталог + unlock + метрики критерия.
 *
 * Зачем: старые QuizResult (до фичи) получат бейджи при открытии профиля;
 * UI всегда видит полный каталог (locked / unlocked) и «текущее / цель», не только строки БД.
 *
 * Метрики считаются на сервере из EvalFacts — клиент не присылает прогресс.
 */

import { userAchievementRepository } from '@/entities/user-achievement/user-achievement.repository';
import { getAchievementCriteriaProgress } from '@/features/achievements/lib/achievement-progress-metrics';
import { awardAchievementsForUser } from '@/features/achievements/lib/award-achievements-for-user';
import {
    ACHIEVEMENT_CATALOG,
    type AchievementProgress,
} from '@/features/achievements/types';

/**
 * null = не удалось прочитать progress после catch-up (UI покажет loadFailed).
 * Объект всегда содержит все MVP-коды в порядке каталога.
 */
export async function getAchievementProgressForUser(
    userId: string,
): Promise<AchievementProgress | null> {
    // Soft-fail catch-up: ошибка award не должна ломать чтение прогресса.
    await awardAchievementsForUser(userId);

    try {
        const { facts, unlockRows } =
            await userAchievementRepository.findProgressContextByUserId(
                userId,
            );
        const unlockedAtByCode = new Map(
            unlockRows.map((row) => [row.code, row.unlockedAt] as const),
        );

        return {
            items: ACHIEVEMENT_CATALOG.map((definition) => {
                const metrics = getAchievementCriteriaProgress(
                    definition,
                    facts,
                );

                return {
                    code: definition.code,
                    unlockedAt: unlockedAtByCode.get(definition.code) ?? null,
                    criteriaCurrent: metrics?.current ?? null,
                    criteriaTarget: metrics?.target ?? null,
                };
            }),
        };
    } catch (error) {
        console.error('Achievement progress load failed:', error);
        return null;
    }
}
