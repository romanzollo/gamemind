/**
 * Подписи «Вызова другу», общие для результата, страницы вызова и превью:
 * строка набора («Классика · Легко · 3 вопроса») и счёт «2 / 3».
 */

import { getSessionDifficultyLabel } from '@/features/quiz/lib/session-difficulty-label';
import { formatPlural, type Dictionary, type Locale } from '@/shared/i18n';
import type { QuizSetupDifficulty } from '@/types';

export function buildChallengeSetLine(
    dictionary: Dictionary,
    locale: Locale,
    setupDifficulty: QuizSetupDifficulty,
    questionCount: number,
): string {
    return [
        dictionary.quiz.classicTitle,
        getSessionDifficultyLabel(setupDifficulty, dictionary.quiz),
        formatPlural(locale, questionCount, dictionary.friendChallenge.questions),
    ].join(' · ');
}

/** «2 / 3» — очки из максимума набора, как на экране результата. */
export function formatChallengeScore(score: number, maxScore: number | null): string {
    return maxScore == null ? String(score) : `${score} / ${maxScore}`;
}
