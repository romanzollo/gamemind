/**
 * Варианты сложности для чипов в шторках режимов. Один список на Классику,
 * Блиц и Выживание — порядок и подписи не разъедутся между режимами.
 */

import type { QuizSetupDifficulty } from '@/features/quiz/types';
import type { SurvivalDifficulty } from '@/features/survival-mode/types';
import type { Dictionary } from '@/shared/i18n';

type DifficultyLabels = Pick<
    Dictionary['quiz'],
    'easy' | 'medium' | 'hard' | 'mixed'
>;

/** Без смешанной: Выживание (Zod режет MIXED, см. Survival Mode MVP). */
export function singleDifficultyChipOptions(labels: DifficultyLabels) {
    return [
        { value: 'EASY', label: labels.easy },
        { value: 'MEDIUM', label: labels.medium },
        { value: 'HARD', label: labels.hard },
    ] as const satisfies ReadonlyArray<{
        value: SurvivalDifficulty;
        label: string;
    }>;
}

/** Со смешанной: Классика и Блиц. */
export function setupDifficultyChipOptions(labels: DifficultyLabels) {
    return [
        ...singleDifficultyChipOptions(labels),
        { value: 'MIXED', label: labels.mixed },
    ] as const satisfies ReadonlyArray<{
        value: QuizSetupDifficulty;
        label: string;
    }>;
}
