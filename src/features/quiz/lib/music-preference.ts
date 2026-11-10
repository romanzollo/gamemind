/**
 * «Музыкальные вопросы» — выбор этого устройства (AUDIO_GUESS).
 *
 * Хранится в cookie `gm_music`, а не в профиле: «в метро без звука» —
 * про устройство, а не про игрока. Сервер читает cookie в Server Actions
 * старта (Классика, Блиц, Выживание — в том числе «Продолжить», реванш,
 * следующая волна), поэтому в формах поле не нужно. Главная читает её при
 * рендере, чтобы переключатель сразу стоял в нужном положении.
 *
 * Это подсказка, а не источник истины для очков: подделка cookie меняет
 * только набор вопросов игрока. Мусор и отсутствие cookie — «включено».
 * ADR: docs/DECISIONS.md → AUDIO_GUESS → Mobile and «no sound».
 */

export const MUSIC_PREFERENCE_COOKIE = 'gm_music';

/**
 * Показывать ли переключатель в шторках. Выключатель-рубильник на случай,
 * если аудиовопросы придётся убрать из пула: без них переключатель ничего
 * не меняет. Серверное исключение работает всегда.
 */
export const AUDIO_QUESTIONS_IN_LOBBY = true;

const YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Значение cookie → включена ли музыка. Только явное `0` выключает. */
export function parseMusicPreference(value: string | undefined): boolean {
    return value !== '0';
}

/**
 * Выбор из cookie. `read` — `cookies().get(name)?.value` на сервере;
 * так модуль не зависит от `next/headers` и тестируется без Next.
 */
export function readMusicPreference(
    read: (name: string) => string | undefined,
): boolean {
    return parseMusicPreference(read(MUSIC_PREFERENCE_COOKIE));
}

const listeners = new Set<() => void>();

/** Подписка для useSyncExternalStore: шторки режимов видят одно значение. */
export function subscribeMusicPreference(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** Только браузер: текущее значение cookie. */
export function readBrowserMusicPreference(): boolean {
    const entry = document.cookie
        .split('; ')
        .find((part) => part.startsWith(`${MUSIC_PREFERENCE_COOKIE}=`));

    return parseMusicPreference(entry?.slice(MUSIC_PREFERENCE_COOKIE.length + 1));
}

/** Только браузер: запомнить выбор на год и сообщить подписчикам. */
export function rememberMusicPreference(enabled: boolean): void {
    document.cookie = `${MUSIC_PREFERENCE_COOKIE}=${enabled ? '1' : '0'}; path=/; max-age=${YEAR_SECONDS}; SameSite=Lax`;

    for (const listener of listeners) {
        listener();
    }
}
