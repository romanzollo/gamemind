/**
 * Чистая оценка Achievements по уже собранным фактам.
 *
 * Зачем отдельный модуль без Prisma/Neon:
 * - критерии можно покрыть Vitest без БД;
 * - SQL только собирает `AchievementEvalFacts`; правила unlock живут здесь;
 * - award-слой вставляет коды идемпотентно — эта функция не пишет в БД.
 *
 * Canon: docs/DECISIONS.md → Achievements MVP.
 */

import {
    ACHIEVEMENT_CATALOG,
    type AchievementCode,
    type AchievementDefinition,
    type AchievementEvalFacts,
} from '@/features/achievements/types';

/**
 * Выполнен ли критерий одного бейджа для данных фактов.
 * Намеренно узкая функция — удобно тестировать крайние пороги отдельно.
 */
export function isAchievementCriteriaMet(
    definition: AchievementDefinition,
    facts: AchievementEvalFacts,
): boolean {
    switch (definition.criteria) {
        case 'quizzes_completed_at_least': {
            const threshold = definition.threshold ?? 0;
            return facts.quizzesCompleted >= threshold;
        }
        case 'perfect_quiz_once':
            return facts.hasPerfectQuiz;
        case 'daily_challenge_completed_once':
            return facts.hasDailyCompleted;
        case 'medium_quiz_completed_once':
            return facts.hasMediumCompleted;
        case 'hard_quiz_completed_once':
            return facts.hasHardCompleted;
        default: {
            // Исчерпывающий switch: новый kind в типах без ветки = ошибка компиляции.
            const _exhaustive: never = definition.criteria;
            return _exhaustive;
        }
    }
}

/**
 * Коды бейджей, которые игрок уже заслужил по фактам.
 * Порядок = порядок `ACHIEVEMENT_CATALOG` (стабильный для UI и тестов).
 */
export function evaluateAchievements(
    facts: AchievementEvalFacts,
): AchievementCode[] {
    return ACHIEVEMENT_CATALOG.filter((definition) =>
        isAchievementCriteriaMet(definition, facts),
    ).map((definition) => definition.code);
}

/**
 * Из уже заслуженных кодов оставляет те, которых ещё нет в unlock-наборе.
 * Нужно award-слою: не слать в INSERT то, что уже есть (хотя UNIQUE тоже защитит).
 */
export function getNewlyEarnedAchievementCodes(
    earnedCodes: readonly AchievementCode[],
    alreadyUnlockedCodes: ReadonlySet<string> | readonly string[],
): AchievementCode[] {
    const unlocked =
        alreadyUnlockedCodes instanceof Set
            ? alreadyUnlockedCodes
            : new Set(alreadyUnlockedCodes);

    return earnedCodes.filter((code) => !unlocked.has(code));
}
