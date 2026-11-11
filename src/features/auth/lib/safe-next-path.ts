/**
 * Куда вернуть игрока после входа (`next` в форме входа).
 *
 * Сейчас — только страница «Вызова другу»: друг пришёл по ссылке, вошёл
 * (паролем, через Яндекс / VK или гостем) и должен вернуться к вызову, а не
 * в профиль. Пропускаем только точный вид `/{ru|en}/challenge/{id}` —
 * никаких внешних адресов и `//host` (open redirect).
 * ADR: docs/DECISIONS.md → Friend challenge.
 */

const NEXT_PATH_PATTERN = /^\/(ru|en)\/challenge\/[A-Za-z0-9_-]{11}$/;

export function readSafeNextPath(value: unknown): string | null {
    return typeof value === 'string' && NEXT_PATH_PATTERN.test(value)
        ? value
        : null;
}
