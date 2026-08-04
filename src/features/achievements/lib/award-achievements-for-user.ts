/**
 * Серверный award Achievements после появления QuizResult.
 *
 * Оркестрация feature-слоя:
 * 1) факты из БД;
 * 2) чистый evaluate;
 * 3) diff с уже unlock;
 * 4) INSERT ON CONFLICT DO NOTHING + mark AchievementOutbox processed.
 *
 * Soft-fail: любая ошибка логируется и глотается — submit/result UX
 * не должен падать из‑за бейджей. Scoring / snapshot не вызываются отсюда.
 *
 * Delivery: submit пишет outbox на write-client; этот processor / profile
 * catch-up / result Suspense забирают pending. Не fire-and-forget без outbox.
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
 * Идемпотентно; безопасно после submit (outbox), profile catch-up, result flash.
 */
export async function awardAchievementsForUser(
    userId: string,
): Promise<AwardAchievementsResult> {
    try {
        // Один TLS/client на оба SELECT — не параллелить два withDirectPgClient
        // (Windows + next dev: wedge → timeout на следующем result GET).
        const { facts, unlockedCodes } =
            await userAchievementRepository.findAwardContextByUserId(userId);

        const earnedCodes = evaluateAchievements(facts);
        const newlyEarned = getNewlyEarnedAchievementCodes(
            earnedCodes,
            unlockedCodes,
        );

        // Даже без новых кодов помечаем pending outbox processed (пустой insert).
        await userAchievementRepository.processOutboxAwardPass(
            userId,
            newlyEarned,
        );

        return { awardedCodes: newlyEarned, ok: true };
    } catch (error) {
        console.error('Achievement award failed (non-fatal):', error);
        return { awardedCodes: [], ok: false };
    }
}

/**
 * Обрабатывает pending outbox для userId (после submit / на result flash).
 * Тот же soft-fail контракт, что awardAchievementsForUser.
 */
export async function processAchievementOutboxForUser(
    userId: string,
): Promise<AwardAchievementsResult> {
    return awardAchievementsForUser(userId);
}
