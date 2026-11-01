/**
 * Ник для аккаунта, созданного через внешний вход (Яндекс ID, VK ID).
 *
 * Провайдер не знает наших правил ника (`registerSchema`: латиница, цифры,
 * `_`, 3–20 символов), поэтому имя из профиля приводим к ним: кириллицу
 * транслитерируем, остальное заменяем на `_`. Игрок может сменить ник
 * в профиле. Чистые функции — без БД, проверка занятости в адаптере.
 * Canon: docs/DECISIONS.md → Accounts without a password.
 */

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;

/** Ник по умолчанию, когда из профиля ничего пригодного не вышло. */
export const FALLBACK_USERNAME = 'player';

/** Префикс ников гостей — выбрать такой ник самому нельзя. */
export const GUEST_USERNAME_PREFIX = 'guest_';

const CYRILLIC_TO_LATIN: Record<string, string> = {
    а: 'a',
    б: 'b',
    в: 'v',
    г: 'g',
    д: 'd',
    е: 'e',
    ё: 'e',
    ж: 'zh',
    з: 'z',
    и: 'i',
    й: 'y',
    к: 'k',
    л: 'l',
    м: 'm',
    н: 'n',
    о: 'o',
    п: 'p',
    р: 'r',
    с: 's',
    т: 't',
    у: 'u',
    ф: 'f',
    х: 'kh',
    ц: 'ts',
    ч: 'ch',
    ш: 'sh',
    щ: 'shch',
    ъ: '',
    ы: 'y',
    ь: '',
    э: 'e',
    ю: 'yu',
    я: 'ya',
};

function transliterate(value: string): string {
    let result = '';

    for (const char of value) {
        const lower = char.toLowerCase();
        const latin = CYRILLIC_TO_LATIN[lower];

        if (latin === undefined) {
            result += char;
        } else if (char !== lower && latin.length > 0) {
            // Заглавная буква остаётся заглавной: «Роман» → «Roman»
            result += latin[0].toUpperCase() + latin.slice(1);
        } else {
            result += latin;
        }
    }

    return result;
}

function trimUnderscores(value: string): string {
    return value.replace(/^_+|_+$/g, '');
}

/**
 * Основа ника из логина / имени провайдера. Почта режется до `@`, чтобы
 * адрес не светился в рейтинге.
 */
export function toUsernameBase(raw: string | null | undefined): string {
    const source = (raw ?? '').split('@')[0];
    const cleaned = trimUnderscores(
        transliterate(source)
            .replace(/[^a-zA-Z0-9_]+/g, '_')
            .replace(/_+/g, '_'),
    );
    const base = trimUnderscores(cleaned.slice(0, USERNAME_MAX_LENGTH));

    if (base.length < USERNAME_MIN_LENGTH) {
        return FALLBACK_USERNAME;
    }

    if (base.toLowerCase().startsWith(GUEST_USERNAME_PREFIX)) {
        return FALLBACK_USERNAME;
    }

    return base;
}

/** Ник с префиксом гостя игрок выбрать не может — ни при регистрации, ни в профиле. */
export function isReservedUsername(username: string): boolean {
    return username.trim().toLowerCase().startsWith(GUEST_USERNAME_PREFIX);
}

const GUEST_SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const GUEST_SUFFIX_LENGTH = 6;

/**
 * Ник гостя: `guest_` + 6 случайных символов [a-z0-9] — 36⁶ ≈ 2 млрд
 * вариантов. Web Crypto, без `node:crypto`: модуль остаётся чистым.
 */
export function createGuestUsername(): string {
    const values = crypto.getRandomValues(
        new Uint32Array(GUEST_SUFFIX_LENGTH),
    );
    let suffix = '';

    for (const value of values) {
        suffix += GUEST_SUFFIX_ALPHABET[value % GUEST_SUFFIX_ALPHABET.length];
    }

    return `${GUEST_USERNAME_PREFIX}${suffix}`;
}

/** `base_1234` в пределах 20 символов (основа укорачивается, суффикс — нет). */
export function withUsernameSuffix(base: string, suffix: string): string {
    const room = USERNAME_MAX_LENGTH - suffix.length - 1;
    const head = trimUnderscores(base.slice(0, room)) || FALLBACK_USERNAME;

    return `${head}_${suffix}`;
}
