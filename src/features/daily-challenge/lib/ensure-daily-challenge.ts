/**
 * Ленивое создание Daily Challenge на календарный день (Moscow).
 *
 * Оркестрация feature-слоя:
 * 1) ключ дня;
 * 2) SELECT существующей строки;
 * 3) иначе — pool PUBLISHED+isActive → детерминированный pick → INSERT ON CONFLICT.
 *
 * Не создаёт QuizSession и не трогает snapshot/scoring — только freeze дня.
 */

import { dailyChallengeRepository } from '@/entities/daily-challenge/daily-challenge.repository';
import { getMoscowDateKey } from '@/features/daily-challenge/lib/get-moscow-date-key';
import { pickDailyQuestionIds } from '@/features/daily-challenge/lib/pick-daily-question-ids';
import {
    DAILY_CHALLENGE_MVP_RULES,
    type DailyChallengeDefinition,
} from '@/features/daily-challenge/types';

export type EnsureDailyChallengeResult =
    | {
          ok: true;
          challenge: DailyChallengeDefinition;
          /** true только если эта попытка реально вставила строку (приблизительно: не было до вызова). */
          created: boolean;
      }
    | {
          ok: false;
          reason: 'insufficient_pool';
          challengeDate: string;
          poolSize: number;
          required: number;
      };

/**
 * Возвращает определение челленджа на «сегодня» (или на `now`).
 * Идемпотентно при повторных вызовах и при гонке двух игроков.
 */
export async function ensureDailyChallenge(
    now: Date = new Date(),
): Promise<EnsureDailyChallengeResult> {
    const challengeDate = getMoscowDateKey(now);
    const difficulty = DAILY_CHALLENGE_MVP_RULES.difficulty;
    const questionCount = DAILY_CHALLENGE_MVP_RULES.questionCount;

    const existing =
        await dailyChallengeRepository.findByChallengeDate(challengeDate);

    if (existing) {
        return {
            ok: true,
            challenge: existing,
            created: false,
        };
    }

    const poolIds =
        await dailyChallengeRepository.findPublishedQuestionIdsByDifficulty(
            difficulty,
        );

    if (poolIds.length < questionCount) {
        return {
            ok: false,
            reason: 'insufficient_pool',
            challengeDate,
            poolSize: poolIds.length,
            required: questionCount,
        };
    }

    const questionIds = pickDailyQuestionIds(
        poolIds,
        questionCount,
        challengeDate,
    );

    if (questionIds.length !== questionCount) {
        return {
            ok: false,
            reason: 'insufficient_pool',
            challengeDate,
            poolSize: poolIds.length,
            required: questionCount,
        };
    }

    const { challenge, created } =
        await dailyChallengeRepository.createOrGetExisting({
            challengeDate,
            difficulty,
            questionCount,
            questionIds,
        });

    return {
        ok: true,
        challenge,
        created,
    };
}
