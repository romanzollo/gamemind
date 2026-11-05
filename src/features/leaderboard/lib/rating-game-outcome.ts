/**
 * Что сказать про рейтинг на экране результата игры (ROADMAP 4.6e).
 *
 * «+N» — разница очков недели «после» и «до» этой игры из одного и того же
 * SQL таблицы (`findGameContribution`), а не пересчёт правил в JS: потолок
 * дня, темы, часы Выживания и видимость игрока учтены там же, где таблица.
 * Здесь — только выбор, что показать. Чистая функция, покрыта тестами.
 */

import type { RatingGameContribution } from '@/entities/quiz-result/rating-points.repository';

export type RatingGameOutcome =
    | { kind: 'none' }
    /** Игра по теме: в рейтинг не идёт (ADR Play topics). */
    | { kind: 'topic' }
    /** Игра засчитана, но дневной лимит уже был набран — +0. */
    | { kind: 'capped' }
    | {
          kind: 'gain';
          gain: number;
          place: number;
          total: number;
          /** На сколько мест поднялся; null — место не изменилось или новичок. */
          movedUp: number | null;
          /** До этой игры игрока в таблице недели не было. */
          newEntry: boolean;
          /** Лимит дня срезал часть очков игры. */
          capReached: boolean;
          /**
           * Отрыв от второго места, если игрок первый; один в таблице —
           * отрыв равен его очкам. null — не первый.
           */
          lead: number | null;
      };

export type RatingGameInput = {
    contribution: RatingGameContribution | null;
    /** `QuizResult.score` этой игры. */
    score: number;
    isTopicGame: boolean;
    isGuest: boolean;
    /** Волна Выживания без честных часов в рейтинг не идёт — у неё свой баннер. */
    survivalClockOk: boolean | null;
    isSurvival: boolean;
};

export function resolveRatingGameOutcome(
    input: RatingGameInput,
): RatingGameOutcome {
    if (input.isGuest) {
        return { kind: 'none' };
    }

    if (input.isTopicGame) {
        return { kind: 'topic' };
    }

    const { contribution } = input;

    if (
        !contribution ||
        !contribution.inPeriod ||
        (input.isSurvival && input.survivalClockOk !== true)
    ) {
        return { kind: 'none' };
    }

    const { before, after } = contribution;
    const gain = (after?.points ?? 0) - (before?.points ?? 0);

    // Нет в таблице «после» — игрок скрыт из рейтингов (тест-аккаунт,
    // неактивный) или у него 0 очков: молчим, это не лимит.
    if (!after) {
        return { kind: 'none' };
    }

    if (gain <= 0) {
        return input.score > 0 ? { kind: 'capped' } : { kind: 'none' };
    }

    const movedUp =
        before && before.rank > after.rank ? before.rank - after.rank : null;

    return {
        kind: 'gain',
        gain,
        place: after.rank,
        total: after.totalPlayers,
        movedUp,
        newEntry: before === null,
        capReached: gain < input.score,
        lead: after.rank === 1 ? after.points - (after.pointsBelow ?? 0) : null,
    };
}
