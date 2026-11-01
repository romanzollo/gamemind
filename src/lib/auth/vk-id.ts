/**
 * Вход через VK ID (id.vk.ru): OAuth 2.1 с обязательным PKCE.
 *
 * Встроенный провайдер Auth.js `vk` ходит на старый oauth.vk.com, поэтому
 * провайдер свой. Здесь всё, чем VK ID отличается от обычного OAuth:
 *
 * - `state` — только `[a-zA-Z0-9_-]`, от 32 символов. Свой state Auth.js —
 *   зашифрованный JWT с точками, VK ID его не примет. Поэтому проверка
 *   state в Auth.js выключена (`checks: ['pkce']`), а случайный state кладёт
 *   в ссылку `oauthSignInAction`. От подмены кода защищает PKCE: верификатор
 *   лежит в cookie браузера, начавшего вход (RFC 9700, §2.1.1).
 * - обмен кода требует `device_id` и `state` из колбэка, а Auth.js их
 *   не передаёт. Маршрут Auth.js кладёт их в AsyncLocalStorage на время
 *   запроса, перехватчик fetch провайдера дописывает в тело.
 * - в ответе с токеном есть `id_token`, который Auth.js проверял бы как OIDC
 *   и не прошёл бы. Профиль берём из user_info, токен выбрасываем.
 *
 * Почту VK ID не подтверждает, поэтому автопривязки по почте нет: совпадение
 * с чужим аккаунтом → OAuthAccountNotLinked. Секрета у web-входа нет,
 * включается одним `AUTH_VK_ID` (Auth.js подставляет его как clientId).
 *
 * Только сервер. Canon: docs/DECISIONS.md → Accounts without a password.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { customFetch, type User } from 'next-auth';
import type { OAuthConfig } from 'next-auth/providers';
import { z } from 'zod';

export const VK_ID_PROVIDER_ID = 'vk';

const VK_ID_AUTHORIZATION_URL = 'https://id.vk.ru/authorize';
const VK_ID_TOKEN_URL = 'https://id.vk.ru/oauth2/auth';
const VK_ID_USER_INFO_URL = 'https://id.vk.ru/oauth2/user_info';

/** Имя, фамилия, аватар и почта (без `email` VK ID почту не отдаёт). */
const VK_ID_SCOPE = 'vkid.personal_info email';

/** Сколько ждём user_info, прежде чем считать вход неудачным. */
const USER_INFO_TIMEOUT_MS = 10_000;

export const isVkIdSignInEnabled = Boolean(process.env.AUTH_VK_ID);

/** Случайный state по правилам VK ID: 43 символа base64url. */
export function createVkIdState(): string {
    return randomBytes(32).toString('base64url');
}

/** Параметры колбэка VK ID, которых Auth.js не знает. */
export type VkIdCallbackParams = {
    deviceId: string;
    state: string;
};

const callbackParamsStorage = new AsyncLocalStorage<VkIdCallbackParams>();

/** `device_id` и `state` колбэка VK ID; для других адресов — null. */
export function readVkIdCallbackParams(url: URL): VkIdCallbackParams | null {
    if (!url.pathname.endsWith(`/callback/${VK_ID_PROVIDER_ID}`)) {
        return null;
    }

    const deviceId = url.searchParams.get('device_id');
    const state = url.searchParams.get('state');

    // Без device_id (например, игрок нажал «Отмена») обмена кода не будет:
    // Auth.js сам разберёт ошибку из адреса.
    return deviceId && state ? { deviceId, state } : null;
}

export function runWithVkIdCallbackParams<T>(
    params: VkIdCallbackParams,
    run: () => T,
): T {
    return callbackParamsStorage.run(params, run);
}

/**
 * fetch провайдера: Auth.js зовёт его только для обмена кода на токен.
 * Без параметров колбэка VK ID код не примет — сразу ошибка, без запроса.
 */
async function fetchVkIdToken(
    input: RequestInfo | URL,
    init?: RequestInit,
): Promise<Response> {
    const params = callbackParamsStorage.getStore();
    const body = init?.body;

    if (!params || !(body instanceof URLSearchParams)) {
        throw new Error('VK_ID_CALLBACK_PARAMS_MISSING');
    }

    body.set('device_id', params.deviceId);
    body.set('state', params.state);

    return fetch(input, init);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonResponse(body: Record<string, unknown>, status: number) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

/**
 * Ответ с токеном → только то, что нужно Auth.js для запроса профиля.
 * `id_token` и `refresh_token` выбрасываем: токены провайдера не храним.
 * Ошибку VK ID отдаём статусом 400, чтобы Auth.js записал её код в лог.
 */
export async function conformVkIdTokenResponse(
    response: Response,
): Promise<Response | undefined> {
    const body: unknown = await response.json().catch(() => null);

    if (!isRecord(body)) {
        return undefined;
    }

    if (typeof body.error === 'string') {
        return jsonResponse(
            {
                error: body.error,
                error_description: body.error_description,
            },
            response.ok ? 400 : response.status,
        );
    }

    return jsonResponse(
        {
            access_token: body.access_token,
            token_type: body.token_type ?? 'Bearer',
            expires_in: body.expires_in,
        },
        response.status,
    );
}

const vkIdUserInfoSchema = z.object({
    user: z.object({
        user_id: z
            .union([z.string().min(1), z.number().int().positive()])
            .transform(String),
        first_name: z.string().optional(),
        last_name: z.string().optional(),
        avatar: z.string().optional(),
        email: z.string().optional(),
    }),
});

export type VkIdProfile = z.output<typeof vkIdUserInfoSchema>['user'];

/** Профиль из ответа user_info. Ошибка VK ID или чужой формат → исключение. */
export function parseVkIdUserInfo(body: unknown): VkIdProfile {
    const parsed = vkIdUserInfoSchema.safeParse(body);

    if (!parsed.success) {
        // В сообщение — только код ошибки VK ID: ответ может содержать PII.
        const code =
            isRecord(body) && typeof body.error === 'string'
                ? body.error
                : 'invalid_response';
        throw new Error(`VK_ID_USER_INFO_FAILED: ${code}`);
    }

    return parsed.data.user;
}

/** user_info ждёт client_id и access_token в теле POST, а не в заголовке. */
async function requestVkIdUserInfo({
    tokens,
    provider,
}: {
    tokens: { access_token?: string };
    provider: { clientId?: string };
}): Promise<VkIdProfile> {
    if (!tokens.access_token || !provider.clientId) {
        throw new Error('VK_ID_USER_INFO_FAILED: missing_token');
    }

    const response = await fetch(VK_ID_USER_INFO_URL, {
        method: 'POST',
        body: new URLSearchParams({
            client_id: provider.clientId,
            access_token: tokens.access_token,
        }),
        signal: AbortSignal.timeout(USER_INFO_TIMEOUT_MS),
    });

    return parseVkIdUserInfo(await response.json().catch(() => null));
}

/** Логина у VK ID нет: ник адаптер соберёт из имени и фамилии. */
export function toVkIdUser(profile: VkIdProfile): User {
    const name = [profile.first_name, profile.last_name]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(' ');

    return {
        id: profile.user_id,
        name: name || null,
        email: profile.email?.trim() || null,
        image: profile.avatar?.trim() || null,
        // Роль адаптер не пишет, в JWT попадает роль из БД (как у Яндекса).
        role: 'USER',
    };
}

export const vkIdProvider: OAuthConfig<VkIdProfile> = {
    id: VK_ID_PROVIDER_ID,
    name: 'VK ID',
    type: 'oauth',
    checks: ['pkce'],
    client: { token_endpoint_auth_method: 'none' },
    authorization: {
        url: VK_ID_AUTHORIZATION_URL,
        params: { scope: VK_ID_SCOPE },
    },
    token: { url: VK_ID_TOKEN_URL, conform: conformVkIdTokenResponse },
    userinfo: { url: VK_ID_USER_INFO_URL, request: requestVkIdUserInfo },
    profile: toVkIdUser,
    // Свой fetch Auth.js берёт только из options: символьные ключи
    // при слиянии конфига провайдера не копируются.
    options: { [customFetch]: fetchVkIdToken },
};
