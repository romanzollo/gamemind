/**
 * Правила «Вызова другу» (чистые функции, без БД).
 *
 * - какую партию можно превратить в вызов;
 * - кто победил (счёт по тем же вопросам: больше очков — выше, иначе ничья;
 *   времени в Классике нет);
 * - максимум очков набора — как у результата Классики.
 *
 * Canon: docs/DECISIONS.md → Friend challenge.
 */

import type { ChallengeSourceSession } from '@/entities/friend-challenge/friend-challenge.repository';
import { getMixedMaxPossibleScore } from '@/features/quiz/lib/mixed-difficulty-split';
import { getMaxPossibleScore } from '@/features/quiz/lib/scoring';
import type { Difficulty, QuizSessionPoolKind, QuizSetupDifficulty } from '@/types';

/**
 * Только сданная Классика на всём банке: не Блиц (там ещё и время), не
 * Выживание (волны собираются на ходу), не Челлендж дня (он и так общий),
 * не тема и не сам вызов (без цепочек по известному набору).
 */
export function isChallengeableSession(source: ChallengeSourceSession): boolean {
    if (source.status !== 'COMPLETED') return false;
    if (source.isDaily || source.isTimed || source.isSurvival) return false;
    if (source.hasTopic || source.isFriendChallenge) return false;
    if (!source.marks || source.marks.length !== source.questionCount) return false;

    // Набор без повторов: иначе старт друга не соберёт столько же вопросов.
    return new Set(source.marks.map((mark) => mark.questionId)).size === source.questionCount;
}

export type ChallengeOutcome = 'win' | 'draw' | 'loss';

export function getChallengeOutcome(myScore: number, theirScore: number): ChallengeOutcome {
    if (myScore > theirScore) return 'win';
    if (myScore < theirScore) return 'loss';
    return 'draw';
}

export function getChallengeSetupDifficulty(
    poolKind: QuizSessionPoolKind,
    difficulty: Difficulty | null,
): QuizSetupDifficulty {
    return poolKind === 'MIXED' || !difficulty ? 'MIXED' : difficulty;
}

/** Максимум очков набора; null — сплит Микса неизвестен (не бывает для живых наборов). */
export function getChallengeMaxScore(
    poolKind: QuizSessionPoolKind,
    difficulty: Difficulty | null,
    questionCount: number,
): number | null {
    if (poolKind === 'MIXED' || !difficulty) {
        return getMixedMaxPossibleScore(questionCount);
    }

    return getMaxPossibleScore(Array.from({ length: questionCount }, () => difficulty));
}

/** Ответы друга в порядке вызова; вопрос без ответа — неверно. */
export function orderMarks(
    questionIds: readonly string[],
    answers: ReadonlyMap<string, boolean>,
): boolean[] {
    return questionIds.map((questionId) => answers.get(questionId) === true);
}
