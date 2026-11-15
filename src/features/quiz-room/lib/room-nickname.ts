/**
 * Имя игрока в комнате. У аккаунта по умолчанию — его username, у гостя —
 * сгенерированное игровое имя (`guest_xxxxxx` в комнате не показываем).
 * Имя можно сменить в лобби; уникально в комнате без учёта регистра.
 *
 * Canon: docs/DECISIONS.md → Quiz room.
 */

export const ROOM_NICKNAME_MIN_LENGTH = 2;
export const ROOM_NICKNAME_MAX_LENGTH = 20;

/** Буквы любого алфавита, цифры, пробел и простые разделители. */
const NICKNAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} _.\-]*$/u;

/**
 * Ввод → имя или null. Пробелы по краям убираются, подряд идущие
 * схлопываются; служебные символы и эмодзи не проходят.
 */
export function normalizeRoomNickname(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const nickname = value.normalize('NFC').trim().replace(/\s+/g, ' ');
    const length = [...nickname].length;

    if (
        length < ROOM_NICKNAME_MIN_LENGTH ||
        length > ROOM_NICKNAME_MAX_LENGTH ||
        !NICKNAME_PATTERN.test(nickname)
    ) {
        return null;
    }

    return nickname;
}

/**
 * Имя аккаунта как стартовое имя в комнате: username уже из
 * `[a-zA-Z0-9_]`, длиннее лимита — обрезаем.
 */
export function nicknameFromUsername(username: string): string {
    const trimmed = [...username].slice(0, ROOM_NICKNAME_MAX_LENGTH).join('');

    return normalizeRoomNickname(trimmed) ?? 'Player';
}

/**
 * Имя, свободное в комнате: «Имя», иначе «Имя 2», «Имя 3»… (основа
 * обрезается, чтобы суффикс влез в лимит).
 */
export function dedupeRoomNickname(
    nickname: string,
    taken: readonly string[],
): string {
    const used = new Set(taken.map((name) => name.toLocaleLowerCase()));

    if (!used.has(nickname.toLocaleLowerCase())) {
        return nickname;
    }

    for (let suffix = 2; suffix < 100; suffix += 1) {
        const tail = ` ${suffix}`;
        const base = [...nickname]
            .slice(0, ROOM_NICKNAME_MAX_LENGTH - tail.length)
            .join('')
            .trimEnd();
        const candidate = `${base}${tail}`;

        if (!used.has(candidate.toLocaleLowerCase())) {
            return candidate;
        }
    }

    return nickname;
}

/**
 * Игровое имя для гостя: «прилагательное + существительное» из словаря
 * интерфейса (RU / EN). `random` — для тестов.
 */
export function generateRoomNickname(
    words: { adjectives: readonly string[]; nouns: readonly string[] },
    random: () => number = Math.random,
): string {
    const pick = (list: readonly string[]) =>
        list[Math.floor(random() * list.length)] ?? '';

    const nickname = `${pick(words.adjectives)} ${pick(words.nouns)}`.trim();

    return normalizeRoomNickname(nickname) ?? 'Player';
}
