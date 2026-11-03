/**
 * Эмблема-аватар игрока без фото (4.3b): номер варианта из id игрока.
 *
 * Номер считается на сервере и уходит в `UserAvatar` вместо id — сам id
 * в HTML не попадает. Один id → всегда один вариант: в БД ничего не
 * храним, у гостя после регистрации id тот же, и эмблема не меняется.
 * Совпадение эмблем у двух игроков допустимо — это украшение, а не
 * опознавательный знак. Вид эмблем и цвета — docs/DESIGN.md → Аватар.
 */

export const AVATAR_TONE_COUNT = 6;
export const AVATAR_SHAPES = ['chevrons', 'rings', 'bars', 'grid'] as const;
export const AVATAR_ROTATION_COUNT = 4;

export const AVATAR_PATTERN_COUNT =
    AVATAR_TONE_COUNT * AVATAR_SHAPES.length * AVATAR_ROTATION_COUNT;

export type AvatarShape = (typeof AVATAR_SHAPES)[number];

export type AvatarEmblem = {
    /** 1…AVATAR_TONE_COUNT — суффикс токена `--avatar-N`. */
    tone: number;
    shape: AvatarShape;
    /** Поворот фигуры в градусах: 0 / 90 / 180 / 270. */
    rotation: number;
};

/** FNV-1a 32 бита: быстро, без зависимостей, хорошо перемешивает cuid. */
function hashString(value: string): number {
    let hash = 0x811c9dc5;

    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }

    return hash >>> 0;
}

export function getAvatarPattern(userId: string): number {
    return hashString(userId) % AVATAR_PATTERN_COUNT;
}

/** Номер варианта → тон, фигура, поворот. Мусор приводится в диапазон. */
export function decodeAvatarPattern(pattern: number): AvatarEmblem {
    const safe = Number.isInteger(pattern)
        ? ((pattern % AVATAR_PATTERN_COUNT) + AVATAR_PATTERN_COUNT) %
          AVATAR_PATTERN_COUNT
        : 0;
    const shapeIndex = Math.floor(safe / AVATAR_TONE_COUNT) % AVATAR_SHAPES.length;
    const rotationIndex = Math.floor(
        safe / (AVATAR_TONE_COUNT * AVATAR_SHAPES.length),
    );

    return {
        tone: (safe % AVATAR_TONE_COUNT) + 1,
        shape: AVATAR_SHAPES[shapeIndex],
        rotation: rotationIndex * 90,
    };
}
