/**
 * Чистые метрики прогресса к критерию бейджа (для UI профиля).
 *
 * Зачем отдельный модуль:
 * - лестница QUIZZES_5 → QUIZZES_10 без «текущее / цель» не мотивирует доиграть;
 * - те же `AchievementEvalFacts`, что и evaluate — без второго источника правды;
 * - UI не считает пороги сам и не доверяет клиенту.
 *
 * Не пишет в БД и не меняет award / scoring / snapshot.
 * Canon: docs/DECISIONS.md → Achievements MVP (расширение presentation).
 */

import type {
    AchievementDefinition,
    AchievementEvalFacts,
} from '@/features/achievements/types';

/**
 * Числа для строки прогресса у одного бейджа.
 * `current` не больше `target` — в UI всегда читаемо как «X / Y», даже после перевыполнения.
 */
export type AchievementCriteriaProgress = {
    current: number;
    target: number;
};

/**
 * Прогресс к критерию одного бейджа.
 *
 * Count-критерии: quizzesCompleted / threshold.
 * Once-критерии: 0|1 / 1 (ещё нет / уже есть факт).
 *
 * null только если у count-бейджа нет валидного threshold (битый каталог).
 */
export function getAchievementCriteriaProgress(
    definition: AchievementDefinition,
    facts: AchievementEvalFacts,
): AchievementCriteriaProgress | null {
    switch (definition.criteria) {
        case 'quizzes_completed_at_least': {
            const target = definition.threshold;
            if (target === null || target <= 0) {
                return null;
            }

            return {
                current: Math.min(facts.quizzesCompleted, target),
                target,
            };
        }
        case 'perfect_quiz_once':
            return {
                current: facts.hasPerfectQuiz ? 1 : 0,
                target: 1,
            };
        case 'daily_challenge_completed_once':
            return {
                current: facts.hasDailyCompleted ? 1 : 0,
                target: 1,
            };
        case 'medium_quiz_completed_once':
            return {
                current: facts.hasMediumCompleted ? 1 : 0,
                target: 1,
            };
        case 'hard_quiz_completed_once':
            return {
                current: facts.hasHardCompleted ? 1 : 0,
                target: 1,
            };
        default: {
            const _exhaustive: never = definition.criteria;
            return _exhaustive;
        }
    }
}
