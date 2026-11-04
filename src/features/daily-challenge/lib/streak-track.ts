/**
 * Дорожка вех серии (3 · 7 · 30 дней): насколько она заполнена.
 *
 * Вехи стоят на равных расстояниях, а не по шкале дней: при 3 / 7 / 30
 * честная шкала прижала бы первые две к левому краю, и прогресс к ближней
 * цели был бы не виден. Внутри отрезка между вехами — линейно.
 */

/** 0…1. `milestones` — пороги по возрастанию (из каталога ачивок). */
export function streakTrackFill(
    current: number,
    milestones: readonly number[],
): number {
    if (milestones.length === 0 || current <= 0) {
        return 0;
    }

    const segment = 1 / milestones.length;
    let from = 0;

    for (let index = 0; index < milestones.length; index += 1) {
        const to = milestones[index];

        if (current < to) {
            return index * segment + ((current - from) / (to - from)) * segment;
        }

        from = to;
    }

    return 1;
}
