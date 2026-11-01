/**
 * Вход гостем целиком (3.4): настоящие Auth.js и маршрут /api/auth,
 * вместо БД и общего лимита — заглушки. Проверяем, что гость получает
 * обычную JWT-сессию с `isGuest`, а исчерпанный лимит по IP не создаёт
 * строку и отдаёт свой код ошибки.
 */

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

const repository = vi.hoisted(() => ({
    createGuestUser: vi.fn(),
    findByEmailForLogin: vi.fn(),
}));

const rateLimit = vi.hoisted(() => vi.fn());

vi.mock('@/entities/user/user.repository', () => ({
    userRepository: repository,
}));

vi.mock('@/lib/rate-limit-shared', () => ({
    checkSharedPresetRateLimit: rateLimit,
}));

// next/headers вне запроса Next не работает — IP в тесте не важен.
vi.mock('@/lib/rate-limit-key', () => ({
    getIpRateLimitIdentity: async () => 'ip:test',
}));

const ORIGIN = 'http://localhost:3000';

type RouteHandler = (request: NextRequest) => Promise<Response>;

let GET: RouteHandler;
let POST: RouteHandler;

/** Cookies между запросами, как у браузера. */
function cookieHeader(responses: Response[]): string {
    const cookies = new Map<string, string>();

    for (const response of responses) {
        for (const header of response.headers.getSetCookie()) {
            const pair = header.split(';')[0];
            const separator = pair.indexOf('=');
            cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
        }
    }

    return [...cookies]
        .filter(([, value]) => value)
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
}

/** Кнопка «Играть без регистрации»: csrf → callback провайдера `guest`. */
async function signInAsGuest() {
    const csrf = await GET(new NextRequest(`${ORIGIN}/api/auth/csrf`));
    const { csrfToken } = (await csrf.json()) as { csrfToken: string };

    const response = await POST(
        new NextRequest(`${ORIGIN}/api/auth/callback/guest`, {
            method: 'POST',
            headers: {
                cookie: cookieHeader([csrf]),
                'content-type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                csrfToken,
                callbackUrl: `${ORIGIN}/ru/quiz`,
            }),
        }),
    );

    return { response, cookie: cookieHeader([csrf, response]) };
}

beforeAll(async () => {
    vi.stubEnv('AUTH_SECRET', 'guest-flow-test-secret-0123456789abcdef');
    ({ GET, POST } = await import('@/app/api/auth/[...nextauth]/route'));
});

beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    rateLimit.mockResolvedValue({ ok: true });
    repository.createGuestUser.mockImplementation(async (username: string) => ({
        id: 'guest-1',
        username,
        email: null,
        emailVerified: null,
        image: null,
        role: 'USER',
        isActive: true,
    }));
});

afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
});

describe('guest sign-in through Auth.js', () => {
    it('creates a guest and opens a JWT session marked isGuest', async () => {
        const { response, cookie } = await signInAsGuest();

        expect(response.status).toBe(302);
        expect(response.headers.get('location')).toBe(`${ORIGIN}/ru/quiz`);
        expect(rateLimit).toHaveBeenCalledWith('guest', 'ip:test');
        expect(repository.createGuestUser).toHaveBeenCalledWith(
            expect.stringMatching(/^guest_[a-z0-9]{6}$/),
        );

        const session = await GET(
            new NextRequest(`${ORIGIN}/api/auth/session`, {
                headers: { cookie },
            }),
        );
        const { user } = (await session.json()) as {
            user: { id: string; isGuest: boolean; username: string };
        };

        expect(user).toMatchObject({ id: 'guest-1', isGuest: true });
        expect(user.username).toMatch(/^guest_/);
    });

    it('tries another name when the first one is taken', async () => {
        repository.createGuestUser.mockResolvedValueOnce('taken');

        const { response } = await signInAsGuest();

        expect(response.headers.get('location')).toBe(`${ORIGIN}/ru/quiz`);
        expect(repository.createGuestUser).toHaveBeenCalledTimes(2);
    });

    it('creates nobody when the IP limit is used up', async () => {
        rateLimit.mockResolvedValue({ ok: false });

        const { response } = await signInAsGuest();
        const location = new URL(response.headers.get('location') ?? '');

        expect(location.pathname).toBe('/ru/login');
        expect(location.searchParams.get('code')).toBe('guest_rate_limited');
        expect(repository.createGuestUser).not.toHaveBeenCalled();
    });
});
