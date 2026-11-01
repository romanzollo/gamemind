/**
 * Unit-тесты разбора VK ID: state, параметры колбэка, ответы token и
 * user_info, профиль → игрок. Сквозной вход — в vk-id.flow.test.ts.
 */

import { describe, expect, it } from 'vitest';

import {
    conformVkIdTokenResponse,
    createVkIdState,
    parseVkIdUserInfo,
    readVkIdAvatar,
    readVkIdCallbackParams,
    toVkIdUser,
} from './vk-id';

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

describe('createVkIdState', () => {
    it('fits VK ID rules: 32+ chars of [a-zA-Z0-9_-]', () => {
        expect(createVkIdState()).toMatch(/^[a-zA-Z0-9_-]{32,}$/);
    });

    it('is random on every call', () => {
        expect(createVkIdState()).not.toBe(createVkIdState());
    });
});

describe('readVkIdCallbackParams', () => {
    it('reads device_id and state from the VK ID callback', () => {
        const url = new URL(
            'https://www.game-mind.ru/api/auth/callback/vk?code=c&state=s1&device_id=d1',
        );

        expect(readVkIdCallbackParams(url)).toEqual({
            deviceId: 'd1',
            state: 's1',
        });
    });

    it('ignores other providers', () => {
        const url = new URL(
            'https://www.game-mind.ru/api/auth/callback/yandex?code=c&state=s1&device_id=d1',
        );

        expect(readVkIdCallbackParams(url)).toBeNull();
    });

    it('returns null without device_id (sign-in cancelled)', () => {
        const url = new URL(
            'https://www.game-mind.ru/api/auth/callback/vk?error=access_denied&state=s1',
        );

        expect(readVkIdCallbackParams(url)).toBeNull();
    });
});

describe('conformVkIdTokenResponse', () => {
    it('keeps only what Auth.js needs and drops id_token', async () => {
        const conformed = await conformVkIdTokenResponse(
            jsonResponse({
                access_token: 'at',
                refresh_token: 'rt',
                id_token: 'not.a.jwt',
                token_type: 'Bearer',
                expires_in: 3600,
                user_id: 777,
                state: 's1',
            }),
        );

        expect(conformed?.status).toBe(200);
        expect(await conformed?.json()).toEqual({
            access_token: 'at',
            token_type: 'Bearer',
            expires_in: 3600,
        });
    });

    it('turns an error sent with 200 into 400', async () => {
        const conformed = await conformVkIdTokenResponse(
            jsonResponse({
                error: 'invalid_grant',
                error_description: 'code expired',
            }),
        );

        expect(conformed?.status).toBe(400);
        expect(await conformed?.json()).toEqual({
            error: 'invalid_grant',
            error_description: 'code expired',
        });
    });

    it('leaves a non-JSON response to Auth.js', async () => {
        const conformed = await conformVkIdTokenResponse(
            new Response('Bad Gateway', { status: 502 }),
        );

        expect(conformed).toBeUndefined();
    });
});

describe('parseVkIdUserInfo', () => {
    it('reads the user and turns a numeric id into a string', () => {
        expect(
            parseVkIdUserInfo({
                user: { user_id: 777, first_name: 'Роман', phone: '7999' },
            }),
        ).toEqual({ user_id: '777', first_name: 'Роман' });
    });

    it('throws with the VK ID error code only', () => {
        expect(() =>
            parseVkIdUserInfo({
                error: 'invalid_token',
                error_description: 'token for roman@vk.com expired',
            }),
        ).toThrow(/^VK_ID_USER_INFO_FAILED: invalid_token$/);
    });

    it('throws on an unexpected shape', () => {
        expect(() => parseVkIdUserInfo(null)).toThrow(
            'VK_ID_USER_INFO_FAILED: invalid_response',
        );
    });
});

describe('readVkIdAvatar', () => {
    it('reads the photo link from the sign-in profile', () => {
        expect(
            readVkIdAvatar({ user_id: '777', avatar: ' https://x/a.jpg ' }),
        ).toBe('https://x/a.jpg');
    });

    it('returns null for a profile without a photo or of another shape', () => {
        expect(readVkIdAvatar({ user_id: '777' })).toBeNull();
        expect(readVkIdAvatar(undefined)).toBeNull();
    });
});

describe('toVkIdUser', () => {
    it('builds the name from first and last name', () => {
        expect(
            toVkIdUser({
                user_id: '777',
                first_name: 'Роман',
                last_name: 'Щукин',
                email: 'roman@vk.com',
                avatar: 'https://sun9-1.userapi.com/a.jpg',
            }),
        ).toEqual({
            id: '777',
            name: 'Роман Щукин',
            email: 'roman@vk.com',
            image: 'https://sun9-1.userapi.com/a.jpg',
            role: 'USER',
        });
    });

    it('uses null for empty fields', () => {
        expect(
            toVkIdUser({ user_id: '777', first_name: ' ', email: '' }),
        ).toEqual({
            id: '777',
            name: null,
            email: null,
            image: null,
            role: 'USER',
        });
    });
});
