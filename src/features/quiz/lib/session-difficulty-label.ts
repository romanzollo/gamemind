import type { QuizSetupDifficulty } from '@/features/quiz/types';

/**
 * Подпись и тон чипа сложности сессии (SINGLE EASY|MEDIUM|HARD или MIXED).
 *
 * Один switch для result / profile / admin history — mix не должен
 * выглядеть как MEDIUM. Leaderboard filter использует короткий `filterMixed`.
 */

export type SessionDifficultyLabels = {
    easy: string;
    medium: string;
    hard: string;
    mixed: string;
};

export function getSessionDifficultyLabel(
    difficulty: QuizSetupDifficulty,
    labels: SessionDifficultyLabels,
): string {
    switch (difficulty) {
        case 'EASY':
            return labels.easy;
        case 'MEDIUM':
            return labels.medium;
        case 'HARD':
            return labels.hard;
        case 'MIXED':
            return labels.mixed;
    }
}

/**
 * EASY = foreground (не success: зелёный только у «Верно»).
 * MIXED = info (не warning Medium и не teal primary).
 */
export function getSessionDifficultyChipToneClass(
    difficulty: QuizSetupDifficulty,
): string {
    switch (difficulty) {
        case 'EASY':
            return 'text-foreground';
        case 'MEDIUM':
            return 'text-warning';
        case 'HARD':
            return 'text-danger';
        case 'MIXED':
            return 'text-info';
    }
}
