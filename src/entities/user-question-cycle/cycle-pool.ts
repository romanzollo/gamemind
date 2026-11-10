/**
 * Пул мешка без повторов и исключения при выдаче.
 *
 * Аудиовопросы (AUDIO_GUESS) при выключенной музыке не выдаются, но из пула
 * их не убираем: размер пула — часть состояния мешка, и его смена
 * перемешивает мешок заново (shouldOpenNewCycle). Иначе каждое переключение
 * «Музыкальных вопросов» возвращало бы недавние вопросы. Поэтому аудио идёт
 * в те же исключения, что и сыгранные в забеге Выживания: курсор проходит
 * их насквозь, размер пула не меняется.
 *
 * Чистые функции — без pg. ADR: docs/DECISIONS.md → AUDIO_GUESS → Mobile
 * and «no sound».
 */

/** Строка пула: id и признак аудиовопроса (из того же SELECT, без JOIN). */
export type CyclePoolRow = {
    id: string;
    isAudio: boolean;
};

/**
 * Что не выдавать: сыгранные в забеге (Выживание) и, если музыка выключена,
 * все аудиовопросы пула. Пустой результат — исключений нет (Классика/Блиц
 * с музыкой ведут себя как раньше).
 */
export function buildCycleExcludeIds(input: {
    pool: readonly CyclePoolRow[];
    playedIds?: readonly string[];
    includeAudio: boolean;
}): string[] {
    const exclude = new Set(input.playedIds ?? []);

    if (!input.includeAudio) {
        for (const row of input.pool) {
            if (row.isAudio) {
                exclude.add(row.id);
            }
        }
    }

    return [...exclude];
}
