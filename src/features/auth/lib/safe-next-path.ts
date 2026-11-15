/**
 * Куда вернуть игрока после входа (`next` в форме входа).
 *
 * Только страницы, куда приходят по ссылке друга: «Вызов другу» и комната
 * с кодом. Игрок пришёл по ссылке, вошёл (паролем, через Яндекс / VK или
 * гостем) и должен вернуться туда, а не в профиль. Пропускаем только точный
 * вид `/{ru|en}/challenge/{id}` и `/{ru|en}/room/{КОД}` — никаких внешних
 * адресов и `//host` (open redirect).
 * ADR: docs/DECISIONS.md → Friend challenge; Quiz room.
 */

const NEXT_PATH_PATTERN =
    /^\/(ru|en)\/(challenge\/[A-Za-z0-9_-]{11}|room\/[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4})$/;

export function readSafeNextPath(value: unknown): string | null {
    return typeof value === 'string' && NEXT_PATH_PATTERN.test(value)
        ? value
        : null;
}
