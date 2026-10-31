/**
 * Следующая цель-ачивка за серию для блока серии (сервер, до рендера).
 *
 * Пороги — из ACHIEVEMENT_CATALOG (daily_streak_at_least): меняется каталог
 * — цель меняется сама. Название — из словаря ачивок того же языка.
 */

import { ACHIEVEMENT_CATALOG } from '@/features/achievements/types';
import {
    findNextStreakMilestone,
    type DailyStreak,
} from '@/features/daily-challenge/lib/compute-daily-streak';
import type { Dictionary } from '@/shared/i18n';

export type DailyStreakGoal = {
    title: string;
    daysLeft: number;
};

const STREAK_MILESTONES = ACHIEVEMENT_CATALOG.flatMap((definition) =>
    definition.criteria === 'daily_streak_at_least' &&
    definition.threshold != null
        ? [{ code: definition.code, threshold: definition.threshold }]
        : [],
);

export function resolveStreakGoal(
    streak: DailyStreak,
    dictionary: Dictionary,
): DailyStreakGoal | null {
    const next = findNextStreakMilestone(streak, STREAK_MILESTONES);

    if (!next) {
        return null;
    }

    return {
        title: dictionary.achievements.items[next.code].title,
        daysLeft: next.daysLeft,
    };
}
