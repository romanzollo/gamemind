/**
 * Общие настройки smoke: где лежит сессия служебного игрока и откуда брать
 * его учётные данные.
 *
 * Файл сессии содержит cookie входа — он в .gitignore и не выгружается в
 * артефакты CI.
 */

export const SMOKE_AUTH_STATE_PATH = 'e2e/.auth/smoke-user.json';

export function requireSmokeCredentials(): { email: string; password: string } {
    const email = process.env.SMOKE_EMAIL?.trim();
    const password = process.env.SMOKE_PASSWORD;

    if (!email || !password) {
        throw new Error(
            'SMOKE_EMAIL / SMOKE_PASSWORD are not set (CI: repository secrets; local: .env)',
        );
    }

    return { email, password };
}
