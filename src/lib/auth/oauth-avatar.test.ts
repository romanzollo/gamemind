/**
 * Unit-тесты копии фото из внешнего входа: какие ссылки копируем, что
 * при ошибке вход не ломается, и что повторный вход заменяет только
 * протухающую ссылку провайдера.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
    findAuthUserByAccount: vi.fn(),
    updateImage: vi.fn(),
}));

const storagePut = vi.hoisted(() => vi.fn());

vi.mock('@/entities/user/user.repository', () => ({
    userRepository: repository,
}));

vi.mock('@/lib/storage', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/storage')>()),
    // sharp и Blob не нужны: проверяем, что до них дошло.
    processAvatarToWebp: vi.fn(async () => ({
        buffer: Buffer.from('webp'),
        width: 512,
        height: 512,
        byteSize: 4,
        mimeType: 'image/webp',
    })),
    getMediaStorage: () => ({ put: storagePut }),
}));

import {
    importOAuthAvatar,
    isImportedAvatarUrl,
    refreshImportedAvatar,
} from './oauth-avatar';

const VK_PHOTO = 'https://sun9-80.userapi.com/s/v1/ig1/photo.jpg?quality=96';

function imageResponse(contentType = 'image/jpeg', status = 200) {
    return new Response(new Uint8Array([1, 2, 3]), {
        status,
        headers: { 'content-type': contentType },
    });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    storagePut.mockImplementation(async ({ key }: { key: string }) => ({
        key,
        publicUrl: `/media/${key}`,
    }));
    repository.updateImage.mockResolvedValue('updated');
});

afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('isImportedAvatarUrl', () => {
    it('accepts VK photo hosts over https', () => {
        expect(isImportedAvatarUrl(VK_PHOTO)).toBe(true);
        expect(isImportedAvatarUrl('https://vk.com/images/camera_200.png')).toBe(
            true,
        );
    });

    it('rejects everything else', () => {
        expect(isImportedAvatarUrl('http://sun9-80.userapi.com/a.jpg')).toBe(
            false,
        );
        expect(
            isImportedAvatarUrl('https://userapi.com.evil.example/a.jpg'),
        ).toBe(false);
        expect(
            isImportedAvatarUrl(
                'https://avatars.yandex.net/get-yapic/1/islands-200',
            ),
        ).toBe(false);
        expect(isImportedAvatarUrl('/media/avatars/u-1.webp')).toBe(false);
        expect(isImportedAvatarUrl(null)).toBe(false);
    });
});

describe('importOAuthAvatar', () => {
    it('stores the photo as our avatar', async () => {
        fetchMock.mockResolvedValue(imageResponse());

        const url = await importOAuthAvatar('user-1', VK_PHOTO);

        expect(url).toMatch(/^\/media\/avatars\/user-1-[0-9a-f-]{36}\.webp$/);
        expect(storagePut).toHaveBeenCalledWith(
            expect.objectContaining({ contentType: 'image/webp' }),
        );
    });

    it('returns null when VK answers 404', async () => {
        fetchMock.mockResolvedValue(imageResponse('text/html', 404));

        expect(await importOAuthAvatar('user-1', VK_PHOTO)).toBeNull();
        expect(storagePut).not.toHaveBeenCalled();
    });

    it('returns null for a non-image response', async () => {
        fetchMock.mockResolvedValue(imageResponse('text/html'));

        expect(await importOAuthAvatar('user-1', VK_PHOTO)).toBeNull();
        expect(storagePut).not.toHaveBeenCalled();
    });

    it('never fetches a host outside the list', async () => {
        expect(
            await importOAuthAvatar('user-1', 'https://example.com/a.jpg'),
        ).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe('refreshImportedAvatar', () => {
    const account = { provider: 'vk', providerAccountId: '777' };

    it('replaces a stale VK link with a fresh copy', async () => {
        repository.findAuthUserByAccount.mockResolvedValue({
            id: 'user-1',
            image: 'https://sun9-80.userapi.com/s/v1/ig1/old.jpg',
        });
        fetchMock.mockResolvedValue(imageResponse());

        await refreshImportedAvatar(account, VK_PHOTO);

        expect(repository.updateImage).toHaveBeenCalledWith(
            'user-1',
            expect.stringMatching(/^\/media\/avatars\/user-1-/),
        );
    });

    it('keeps an avatar the player uploaded or cleared', async () => {
        for (const image of ['/media/avatars/user-1-x.webp', null]) {
            repository.findAuthUserByAccount.mockResolvedValue({
                id: 'user-1',
                image,
            });

            await refreshImportedAvatar(account, VK_PHOTO);
        }

        expect(fetchMock).not.toHaveBeenCalled();
        expect(repository.updateImage).not.toHaveBeenCalled();
    });
});
