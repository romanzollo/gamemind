/**
 * Статус «сегодняшнего» Daily Challenge для текущего userId.
 *
 * Зачем: UI CTA (урок 5) не должен дублировать SQL — один helper → available /
 * in_progress / completed / unavailable. Без auth здесь: caller передаёт userId
 * или null (гость).
 */

import { dailyChallengeRepository } from '@/entities/daily-challenge/daily-challenge.repository';
import { ensureDailyChallenge } from '@/features/daily-challenge/lib/ensure-daily-challenge';
import type { DailyChallengePlayerStatus } from '@/features/daily-challenge/types';

export async function getDailyChallengePlayerStatus(
    userId: string | null,
    now: Date = new Date(),
): Promise<DailyChallengePlayerStatus> {
    if (!userId) {
        return {
            kind: 'unavailable',
            reason: 'not_authenticated',
        };
    }

    const ensured = await ensureDailyChallenge(now);

    if (!ensured.ok) {
        return {
            kind: 'unavailable',
            reason: 'insufficient_pool',
        };
    }

    const { challenge } = ensured;
    const attempt =
        await dailyChallengeRepository.findAttemptByUserAndChallenge(
            userId,
            challenge.id,
        );

    if (!attempt) {
        return {
            kind: 'available',
            challengeDate: challenge.challengeDate,
        };
    }

    if (attempt.kind === 'in_progress') {
        return {
            kind: 'in_progress',
            challengeDate: challenge.challengeDate,
            sessionId: attempt.sessionId,
        };
    }

    if (attempt.kind === 'completed') {
        return {
            kind: 'completed',
            challengeDate: challenge.challengeDate,
            sessionId: attempt.sessionId,
            score: attempt.score,
            totalQuestions: attempt.totalQuestions,
            correctCount: attempt.correctCount,
        };
    }

    // ABANDONED: уникальный слот дня занят, но quiz page читает только IN_PROGRESS.
    // Поэтому не отдаём continue-ссылку на `/quiz/:id`, иначе получим честный 404.
    return {
        kind: 'unavailable',
        reason: 'attempt_abandoned',
    };
}
