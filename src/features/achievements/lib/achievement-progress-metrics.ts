/**
 * Чистые метрики прогресса к критерию бейджа (для UI профиля).
 *
 * Зачем отдельный модуль:
 * - лестница QUIZZES_5 → QUIZZES_50 без «текущее / цель» не мотивирует доиграть;
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
 * Count-прогресс: clamp current к target; null если threshold битый.
 */
function countProgress(
    current: number,
    threshold: number | null,
): AchievementCriteriaProgress | null {
    if (threshold === null || threshold <= 0) {
        return null;
    }

    return {
        current: Math.min(current, threshold),
        target: threshold,
    };
}

/**
 * Once-прогресс: 0|1 из булева флага.
 */
function onceProgress(met: boolean): AchievementCriteriaProgress {
    return {
        current: met ? 1 : 0,
        target: 1,
    };
}

/**
 * Прогресс к критерию одного бейджа.
 *
 * Count-критерии: факт / threshold.
 * Once-критерии: 0|1 / 1.
 * Classic+Timed: сколько режимов из двух уже есть (0..2 / 2).
 *
 * null только если у count-бейджа нет валидного threshold (битый каталог).
 */
export function getAchievementCriteriaProgress(
    definition: AchievementDefinition,
    facts: AchievementEvalFacts,
): AchievementCriteriaProgress | null {
    switch (definition.criteria) {
        case 'quizzes_completed_at_least':
            return countProgress(facts.quizzesCompleted, definition.threshold);
        case 'perfect_quiz_once':
            return onceProgress(facts.hasPerfectQuiz);
        case 'perfect_quiz_at_least':
            return countProgress(facts.perfectQuizCount, definition.threshold);
        case 'daily_challenge_completed_once':
            return onceProgress(facts.hasDailyCompleted);
        case 'daily_challenge_completed_at_least':
            return countProgress(
                facts.dailyCompletedCount,
                definition.threshold,
            );
        case 'medium_quiz_completed_once':
            return onceProgress(facts.hasMediumCompleted);
        case 'medium_quiz_completed_at_least':
            return countProgress(
                facts.mediumCompletedCount,
                definition.threshold,
            );
        case 'hard_quiz_completed_once':
            return onceProgress(facts.hasHardCompleted);
        case 'hard_quiz_completed_at_least':
            return countProgress(facts.hardCompletedCount, definition.threshold);
        case 'timed_quiz_completed_once':
            return onceProgress(facts.hasTimedCompleted);
        case 'classic_and_timed_completed': {
            const modesDone =
                (facts.hasClassicCompleted ? 1 : 0) +
                (facts.hasTimedCompleted ? 1 : 0);
            return {
                current: modesDone,
                target: 2,
            };
        }
        case 'high_accuracy_quiz_once':
            return onceProgress(facts.hasHighAccuracy90);
        case 'total_score_at_least':
            return countProgress(facts.totalScore, definition.threshold);
        default: {
            const _exhaustive: never = definition.criteria;
            return _exhaustive;
        }
    }
}
