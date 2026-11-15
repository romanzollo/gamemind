/**
 * Код комнаты: 4 знака из алфавита без похожих символов (нет 0/O, 1/I/L),
 * чтобы его легко было продиктовать и набрать с телефона. 31⁴ ≈ 920 тыс.
 * вариантов; уникальность держит `Room.code UNIQUE` (код освобождается,
 * когда прежняя комната сыграна или брошена).
 *
 * Canon: docs/DECISIONS.md → Quiz room.
 */

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 4;

const ROOM_CODE_PATTERN = new RegExp(
    `^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`,
);

/**
 * Случайный код (Web Crypto: код — приглашение, угадываться не должен).
 * Отбрасываем байты из «хвоста» 256 % 31, чтобы знаки были равновероятны.
 */
export function generateRoomCode(): string {
    const limit = 256 - (256 % ROOM_CODE_ALPHABET.length);
    let code = '';

    while (code.length < ROOM_CODE_LENGTH) {
        const bytes = new Uint8Array(8);
        globalThis.crypto.getRandomValues(bytes);

        for (const byte of bytes) {
            if (byte < limit && code.length < ROOM_CODE_LENGTH) {
                code += ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length];
            }
        }
    }

    return code;
}

/**
 * Ввод игрока → код или null. Регистр и пробелы не важны; похожие знаки,
 * которых нет в алфавите, не угадываем: «0» и «O» одинаково отклоняются.
 */
export function normalizeRoomCode(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const code = value.replace(/[\s-]/g, '').toUpperCase();

    return ROOM_CODE_PATTERN.test(code) ? code : null;
}
