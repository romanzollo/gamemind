/**
 * Серверный award Achievements после появления QuizResult.
 *
 * Оркестрация feature-слоя:
 * 1) факты из БД;
 * 2) чистый evaluate;
 * 3) diff с уже unlock;
 * 4) INSERT ON CONFLICT DO NOTHING.
 *
 * Soft-fail: любая ошибка логируется и глотается — submit/result UX
 * не должен падать из‑за бейджей. Scoring / snapshot не вызываются отсюда.
 *
 * Canon: docs/DECISIONS.md → Achievements MVP.
 */

import { userAchievementRepository } from '@/entities/user-achievement/user-achievement.repository';
import {
    evaluateAchievements,
    getNewlyEarnedAchievementCodes,
} from '@/features/achievements/lib/evaluate-achievements';
import type { AchievementCode } from '@/features/achievements/types';

export type AwardAchievementsResult = {
    /** Коды, которые пытались вставить как новые (после diff). */
    awardedCodes: AchievementCode[];
    /** false только если упали до/во время DB — caller всё равно продолжает. */
    ok: boolean;
};

/**
 * Пересчитывает и дописывает недостающие unlock для пользователя.
 * Идемпотентно; безопасно вызывать после submit и позже на profile catch-up.
 */
export async function awardAchievementsForUser(
    userId: string,
): Promise<AwardAchievementsResult> {
    try {
        const [facts, unlockedCodes] = await Promise.all([
            userAchievementRepository.findEvalFactsByUserId(userId),
            userAchievementRepository.findUnlockedCodesByUserId(userId),
        ]);

        const earnedCodes = evaluateAchievements(facts);
        const newlyEarned = getNewlyEarnedAchievementCodes(
            earnedCodes,
            unlockedCodes,
        );

        if (newlyEarned.length === 0) {
            return { awardedCodes: [], ok: true };
        }

        await userAchievementRepository.insertUnlocks(userId, newlyEarned);

        return { awardedCodes: newlyEarned, ok: true };
    } catch (error) {
        console.error('Achievement award failed (non-fatal):', error);
        return { awardedCodes: [], ok: false };
    }
}
