/**
 * Progress ачивок для профиля: только Direct READ (без award write).
 *
 * Canon / почему так (QUIZ_NEON_HOT_PATH + Aug 4):
 * - одна shared Direct-очередь в next dev — write/длинный hop на профиле
 *   ставит waiters и даёт DB_TIMEOUT на Classic/Blitz start;
 * - award = outbox process на result Suspense (после score), soft-fail;
 * - профиль показывает каталог + unlock + criteria; новые коды из evaluate
 *   рисуем optimistic (пока DB догонит на следующем complete/result).
 *
 * Не вызывать processOutboxAwardPass отсюда.
 */

import { userAchievementRepository } from '@/entities/user-achievement/user-achievement.repository';
import { getAchievementCriteriaProgress } from '@/features/achievements/lib/achievement-progress-metrics';
import {
    evaluateAchievements,
    getNewlyEarnedAchievementCodes,
} from '@/features/achievements/lib/evaluate-achievements';
import {
    ACHIEVEMENT_CATALOG,
    type AchievementProgress,
} from '@/features/achievements/types';

/**
 * null = не удалось прочитать progress (UI покажет loadFailed).
 * Объект всегда содержит все коды каталога в порядке ACHIEVEMENT_CATALOG.
 */
export async function getAchievementProgressForUser(
    userId: string,
): Promise<AchievementProgress | null> {
    try {
        const { facts, unlockRows } =
            await userAchievementRepository.findProgressContextByUserId(
                userId,
            );

        const unlockedAtByCode = new Map(
            unlockRows.map((row) => [row.code, row.unlockedAt] as const),
        );

        // Optimistic: критерий уже выполнен, а строки UserAchievement ещё нет
        // (новые коды каталога / outbox ещё на result). Не пишем в БД здесь.
        const newlyEarned = getNewlyEarnedAchievementCodes(
            evaluateAchievements(facts),
            Array.from(unlockedAtByCode.keys()),
        );
        const now = new Date();
        for (const code of newlyEarned) {
            if (!unlockedAtByCode.has(code)) {
                unlockedAtByCode.set(code, now);
            }
        }

        return {
            items: ACHIEVEMENT_CATALOG.map((definition) => {
                const metrics = getAchievementCriteriaProgress(
                    definition,
                    facts,
                );

                return {
                    code: definition.code,
                    unlockedAt:
                        unlockedAtByCode.get(definition.code) ?? null,
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
