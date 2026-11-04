/**
 * «Ты #4 из 37 · лучше 89% игроков» на карточке Челленджа после игры.
 *
 * Процент — доля ДРУГИХ участников дня, которых игрок обошёл. Показываем
 * его только когда он что-то говорит: от 5 участников (при двух «лучше
 * 100%» звучит странно) и не на краях — первому хватает «#1», последнему
 * «лучше 0%» не нужно. Место показываем всегда.
 */

export const DAILY_STANDING_MIN_FOR_PERCENT = 5;

export type DailyStandingView = {
    place: number;
    total: number;
    /** null — процент не показываем. */
    betterThanPercent: number | null;
};

export function toDailyStandingView(standing: {
    place: number;
    total: number;
}): DailyStandingView | null {
    const { place, total } = standing;

    if (
        !Number.isInteger(place) ||
        !Number.isInteger(total) ||
        total < 1 ||
        place < 1 ||
        place > total
    ) {
        return null;
    }

    const percent =
        total >= DAILY_STANDING_MIN_FOR_PERCENT
            ? Math.floor(((total - place) / (total - 1)) * 100)
            : null;

    return {
        place,
        total,
        betterThanPercent:
            percent !== null && percent >= 1 && percent <= 99 ? percent : null,
    };
}
