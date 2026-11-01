/**
 * Вход через VK ID целиком: настоящие Auth.js, наш адаптер и маршрут
 * /api/auth. Вместо id.vk.ru — подменённый fetch, вместо БД — заглушка
 * репозитория.
 *
 * Зачем: VK ID держится на точках расширения Auth.js (state без проверки,
 * customFetch, token.conform, userinfo.request). Auth.js 5 в бете —
 * обновление может их тихо сломать, и этот тест это поймает.
 */

import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import {
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import type { AuthUserRow } from '@/entities/user/user.repository';

const repository = vi.hoisted(() => ({
    findAuthUserById: vi.fn(),
    findAuthUserByEmail: vi.fn(),
    findAuthUserByAccount: vi.fn(),
    findTakenUsernames: vi.fn(),
    createOAuthUser: vi.fn(),
    linkOAuthAccount: vi.fn(),
    updateImage: vi.fn(),
    findByEmailForLogin: vi.fn(),
}));

const storagePut = vi.hoisted(() => vi.fn());

vi.mock('@/entities/user/user.repository', () => ({
    userRepository: repository,
}));

// Фото VK копируется в наш storage; sharp и Blob в тесте не нужны.
vi.mock('@/lib/storage', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/storage')>()),
    processAvatarToWebp: vi.fn(async () => ({
        buffer: Buffer.from('webp'),
        width: 512,
        height: 512,
        byteSize: 4,
        mimeType: 'image/webp',
    })),
    getMediaStorage: () => ({ put: storagePut }),
}));

const ORIGIN = 'http://localhost:3000';
const CLIENT_ID = '54321';
const STATE = 'vkid_state_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TOKEN_URL = 'https://id.vk.ru/oauth2/auth';
const USER_INFO_URL = 'https://id.vk.ru/oauth2/user_info';
const USERS_GET_URL = 'https://api.vk.com/method/users.get';
const VK_API_PHOTO = 'https://sun9-2.userapi.com/photo_200.jpg';

type RouteHandler = (request: NextRequest) => Promise<Response>;

let GET: RouteHandler;
let POST: RouteHandler;

const vkUser = {
    user_id: '777',
    first_name: 'Роман',
    last_name: 'Щукин',
    email: 'roman@vk.com',
    avatar: 'https://sun9-1.userapi.com/a.jpg',
};

const existingUser: AuthUserRow = {
    id: 'user-existing',
    username: 'roman',
    email: 'roman@vk.com',
    emailVerified: null,
    image: null,
    role: 'USER',
    isActive: true,
};

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

/** VK API отказывает в users.get (например, токен VK ID ему не подошёл). */
let vkApiRefuses = false;

/** Фальшивый VK: id.vk.ru (token, user_info), VK API и картинки фото. */
const vkFetch = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void init;
        const url = String(input);

        if (url === TOKEN_URL) {
            return jsonResponse({
                access_token: 'vk-access-token',
                refresh_token: 'vk-refresh-token',
                id_token: 'not.a.jwt',
                token_type: 'Bearer',
                expires_in: 3600,
                user_id: 777,
                state: STATE,
                scope: 'vkid.personal_info email',
            });
        }

        if (url === USER_INFO_URL) {
            return jsonResponse({ user: vkUser });
        }

        if (url === USERS_GET_URL) {
            return jsonResponse(
                vkApiRefuses
                    ? { error: { error_code: 5 } }
                    : { response: [{ id: 777, photo_200: VK_API_PHOTO }] },
            );
        }

        if (url === VK_API_PHOTO || url === vkUser.avatar) {
            return new Response(new Uint8Array([1, 2, 3]), {
                headers: { 'content-type': 'image/jpeg' },
            });
        }

        return new Response('unexpected request', { status: 500 });
    },
);

function requestBody(url: string): URLSearchParams {
    const call = vkFetch.mock.calls.find(([input]) => String(input) === url);
    const body = call?.[1]?.body;

    if (!(body instanceof URLSearchParams)) {
        throw new Error(`no form body sent to ${url}`);
    }

    return body;
}

/** Cookies между запросами, как у браузера. */
class CookieJar {
    private readonly cookies = new Map<string, string>();

    collect(response: Response) {
        for (const header of response.headers.getSetCookie()) {
            const pair = header.split(';')[0];
            const separator = pair.indexOf('=');
            const name = pair.slice(0, separator);
            const value = pair.slice(separator + 1);

            if (value) {
                this.cookies.set(name, value);
            } else {
                this.cookies.delete(name);
            }
        }
    }

    has(name: string) {
        return this.cookies.has(name);
    }

    delete(name: string) {
        this.cookies.delete(name);
    }

    get header() {
        return [...this.cookies]
            .map(([name, value]) => `${name}=${value}`)
            .join('; ');
    }
}

/** Кнопка «Войти с VK ID»: csrf → signin → ссылка на id.vk.ru. */
async function startSignIn(jar: CookieJar): Promise<URL> {
    const csrfResponse = await GET(
        new NextRequest(`${ORIGIN}/api/auth/csrf`, {
            headers: { cookie: jar.header },
        }),
    );
    jar.collect(csrfResponse);
    const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };

    const signInResponse = await POST(
        new NextRequest(`${ORIGIN}/api/auth/signin/vk?state=${STATE}`, {
            method: 'POST',
            headers: {
                cookie: jar.header,
                'content-type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                csrfToken,
                callbackUrl: `${ORIGIN}/ru/profile`,
            }),
        }),
    );
    jar.collect(signInResponse);

    expect(signInResponse.status).toBe(302);
    return new URL(signInResponse.headers.get('location') ?? '');
}

/** Возврат с id.vk.ru на наш колбэк. */
async function finishSignIn(jar: CookieJar, query: string) {
    const response = await GET(
        new NextRequest(`${ORIGIN}/api/auth/callback/vk?${query}`, {
            headers: { cookie: jar.header },
        }),
    );
    jar.collect(response);

    return response;
}

const SUCCESS_QUERY = `code=vk-code&state=${STATE}&device_id=vk-device&expires_in=600&type=code_v2`;

beforeAll(async () => {
    vi.stubEnv('AUTH_VK_ID', CLIENT_ID);
    vi.stubEnv('AUTH_SECRET', 'vk-id-flow-test-secret-0123456789abcdef');
    ({ GET, POST } = await import('@/app/api/auth/[...nextauth]/route'));
});

beforeEach(() => {
    vkApiRefuses = false;
    vi.stubGlobal('fetch', vkFetch);
    // Auth.js пишет ожидаемые ошибки входа в console.error.
    vi.spyOn(console, 'error').mockImplementation(() => {});

    repository.findAuthUserByAccount.mockResolvedValue(null);
    repository.findAuthUserByEmail.mockResolvedValue(null);
    repository.findTakenUsernames.mockResolvedValue(new Set<string>());
    repository.createOAuthUser.mockImplementation(
        async (input: {
            username: string;
            email: string | null;
            image: string | null;
        }): Promise<AuthUserRow> => ({
            id: 'user-new',
            username: input.username,
            email: input.email,
            emailVerified: null,
            image: input.image,
            role: 'USER',
            isActive: true,
        }),
    );
    repository.linkOAuthAccount.mockResolvedValue(undefined);
    repository.updateImage.mockResolvedValue('updated');
    storagePut.mockImplementation(async ({ key }: { key: string }) => ({
        key,
        publicUrl: `/media/${key}`,
    }));
});

afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('VK ID sign-in through Auth.js', () => {
    it('sends the player to id.vk.ru with VK ID parameters', async () => {
        const authorizeUrl = await startSignIn(new CookieJar());

        expect(authorizeUrl.origin + authorizeUrl.pathname).toBe(
            'https://id.vk.ru/authorize',
        );
        expect(Object.fromEntries(authorizeUrl.searchParams)).toMatchObject({
            response_type: 'code',
            client_id: CLIENT_ID,
            redirect_uri: `${ORIGIN}/api/auth/callback/vk`,
            scope: 'vkid.personal_info email',
            state: STATE,
            code_challenge_method: 'S256',
        });
    });

    it('exchanges the code with device_id and state, then creates the player', async () => {
        const jar = new CookieJar();
        const authorizeUrl = await startSignIn(jar);
        const response = await finishSignIn(jar, SUCCESS_QUERY);

        expect(response.status).toBe(302);
        expect(response.headers.get('location')).toBe(`${ORIGIN}/ru/profile`);
        expect(jar.has('authjs.session-token')).toBe(true);

        const token = requestBody(TOKEN_URL);
        expect(Object.fromEntries(token)).toMatchObject({
            grant_type: 'authorization_code',
            code: 'vk-code',
            client_id: CLIENT_ID,
            redirect_uri: `${ORIGIN}/api/auth/callback/vk`,
            device_id: 'vk-device',
            state: STATE,
        });
        expect(token.has('client_secret')).toBe(false);

        // Верификатор PKCE соответствует challenge из ссылки на id.vk.ru.
        const verifier = token.get('code_verifier') ?? '';
        expect(createHash('sha256').update(verifier).digest('base64url')).toBe(
            authorizeUrl.searchParams.get('code_challenge'),
        );

        expect(Object.fromEntries(requestBody(USER_INFO_URL))).toEqual({
            client_id: CLIENT_ID,
            access_token: 'vk-access-token',
        });
        expect(Object.fromEntries(requestBody(USERS_GET_URL))).toMatchObject({
            access_token: 'vk-access-token',
            fields: 'photo_200',
        });

        // Фото берётся из VK API, а не из ссылки user_info (та отвечала 404).
        const fetchedUrls = vkFetch.mock.calls.map(([input]) => String(input));
        expect(fetchedUrls).toContain(VK_API_PHOTO);
        expect(fetchedUrls).not.toContain(vkUser.avatar);

        // Ссылка VK протухает: строка создаётся без неё, потом — наша копия.
        expect(repository.createOAuthUser).toHaveBeenCalledWith({
            username: 'Roman_Shchukin',
            email: 'roman@vk.com',
            emailVerified: null,
            image: null,
        });
        expect(repository.updateImage).toHaveBeenCalledWith(
            'user-new',
            expect.stringMatching(/^\/media\/avatars\/user-new-.+\.webp$/),
        );
        expect(repository.linkOAuthAccount).toHaveBeenCalledWith({
            userId: 'user-new',
            type: 'oauth',
            provider: 'vk',
            providerAccountId: '777',
        });
    });

    it('falls back to the user_info photo when VK API refuses', async () => {
        vkApiRefuses = true;

        const jar = new CookieJar();
        await startSignIn(jar);
        const response = await finishSignIn(jar, SUCCESS_QUERY);

        expect(response.headers.get('location')).toBe(`${ORIGIN}/ru/profile`);
        const fetchedUrls = vkFetch.mock.calls.map(([input]) => String(input));
        expect(fetchedUrls).toContain(vkUser.avatar);
        expect(repository.updateImage).toHaveBeenCalled();
    });

    it('links VK ID to the signed-in player («Подключить» in the profile)', async () => {
        // Первый вход: VK-аккаунт 777 уже привязан к existingUser — сессия.
        repository.findAuthUserByAccount.mockResolvedValue(existingUser);
        repository.findAuthUserById.mockResolvedValue(existingUser);
        const jar = new CookieJar();
        await startSignIn(jar);
        await finishSignIn(jar, SUCCESS_QUERY);
        expect(jar.has('authjs.session-token')).toBe(true);

        // «Подключить» с той же сессией: этот VK-аккаунт ещё ничей.
        repository.findAuthUserByAccount.mockResolvedValue(null);
        await startSignIn(jar);
        const response = await finishSignIn(jar, SUCCESS_QUERY);

        expect(response.headers.get('location')).toBe(`${ORIGIN}/ru/profile`);
        expect(repository.createOAuthUser).not.toHaveBeenCalled();
        expect(repository.linkOAuthAccount).toHaveBeenCalledWith({
            userId: existingUser.id,
            type: 'oauth',
            provider: 'vk',
            providerAccountId: '777',
        });
    });

    it('signs in a player who already linked VK ID', async () => {
        repository.findAuthUserByAccount.mockResolvedValue(existingUser);

        const jar = new CookieJar();
        await startSignIn(jar);
        const response = await finishSignIn(jar, SUCCESS_QUERY);

        expect(response.headers.get('location')).toBe(`${ORIGIN}/ru/profile`);
        expect(repository.createOAuthUser).not.toHaveBeenCalled();
        expect(repository.linkOAuthAccount).not.toHaveBeenCalled();
        // Аватар у игрока не из VK — повторный вход его не трогает.
        expect(repository.updateImage).not.toHaveBeenCalled();
    });

    it('replaces a stale VK photo link on the next sign-in', async () => {
        repository.findAuthUserByAccount.mockResolvedValue({
            ...existingUser,
            image: 'https://sun9-80.userapi.com/s/v1/ig1/old.jpg',
        });

        const jar = new CookieJar();
        await startSignIn(jar);
        const response = await finishSignIn(jar, SUCCESS_QUERY);

        expect(response.headers.get('location')).toBe(`${ORIGIN}/ru/profile`);
        expect(repository.updateImage).toHaveBeenCalledWith(
            'user-existing',
            expect.stringMatching(/^\/media\/avatars\/user-existing-/),
        );
    });

    it('never links by email: another account with this email → OAuthAccountNotLinked', async () => {
        repository.findAuthUserByEmail.mockResolvedValue(existingUser);

        const jar = new CookieJar();
        await startSignIn(jar);
        const response = await finishSignIn(jar, SUCCESS_QUERY);

        expect(response.headers.get('location')).toBe(
            `${ORIGIN}/ru/login?error=OAuthAccountNotLinked`,
        );
        expect(repository.createOAuthUser).not.toHaveBeenCalled();
        expect(repository.linkOAuthAccount).not.toHaveBeenCalled();
    });

    it('does not exchange a code without the PKCE cookie of this browser', async () => {
        const jar = new CookieJar();
        await startSignIn(jar);
        jar.delete('authjs.pkce.code_verifier');

        const response = await finishSignIn(jar, SUCCESS_QUERY);

        expect(response.headers.get('location')).toMatch(
            `${ORIGIN}/ru/login?error=`,
        );
        expect(vkFetch).not.toHaveBeenCalled();
    });

    it('returns to the login page when the player cancels on id.vk.ru', async () => {
        const jar = new CookieJar();
        await startSignIn(jar);

        const response = await finishSignIn(
            jar,
            `error=access_denied&state=${STATE}`,
        );

        expect(response.headers.get('location')).toMatch(
            `${ORIGIN}/ru/login?error=`,
        );
        expect(vkFetch).not.toHaveBeenCalled();
    });
});
