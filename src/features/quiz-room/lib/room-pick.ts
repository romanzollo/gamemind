/**
 * Выбор вопросов комнаты из пула (чистая функция). Пул собирает репозиторий:
 * опубликованные, активные, без AUDIO_GUESS, по сложности и теме.
 *
 * Микс — равные трети, остаток первым лёгким, потом средним (5 → 2/2/1,
 * 10 → 4/3/3, 20 → 7/7/6), порядок перемешан. Не хватает вопросов —
 * null: сервер вернёт «мало вопросов», ведущий сменит тему или сложность.
 *
 * Canon: docs/DECISIONS.md → Quiz room.
 */

import type { RoomSettings } from '@/features/quiz-room/lib/room-rules';
import type { Difficulty } from '@/types';

export type RoomPoolQuestion = {
    id: string;
    difficulty: Difficulty;
};

export type RoomDifficultySplit = Record<Difficulty, number>;

export function getRoomMixedSplit(questionCount: number): RoomDifficultySplit {
    const base = Math.floor(questionCount / 3);
    const extra = questionCount % 3;

    return {
        EASY: base + (extra >= 1 ? 1 : 0),
        MEDIUM: base + (extra >= 2 ? 1 : 0),
        HARD: base,
    };
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
    const result = [...items];

    for (let index = result.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(random() * (index + 1));
        [result[index], result[swap]] = [result[swap]!, result[index]!];
    }

    return result;
}

export function pickRoomQuestionIds(
    pool: readonly RoomPoolQuestion[],
    settings: Pick<RoomSettings, 'difficulty' | 'questionCount'>,
    random: () => number = Math.random,
): string[] | null {
    const unique = [...new Map(pool.map((row) => [row.id, row])).values()];

    if (settings.difficulty !== 'MIXED') {
        const bag = unique.filter((row) => row.difficulty === settings.difficulty);

        if (bag.length < settings.questionCount) {
            return null;
        }

        return shuffle(bag, random)
            .slice(0, settings.questionCount)
            .map((row) => row.id);
    }

    const split = getRoomMixedSplit(settings.questionCount);
    const picked: string[] = [];

    for (const difficulty of ['EASY', 'MEDIUM', 'HARD'] as const) {
        const bag = unique.filter((row) => row.difficulty === difficulty);

        if (bag.length < split[difficulty]) {
            return null;
        }

        picked.push(
            ...shuffle(bag, random)
                .slice(0, split[difficulty])
                .map((row) => row.id),
        );
    }

    return shuffle(picked, random);
}
