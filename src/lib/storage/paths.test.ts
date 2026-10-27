import { describe, expect, it } from 'vitest';

import {
    buildAvatarStorageKey,
    buildQuizStorageKey,
    isStorageKeyOwnedBy,
    storageKeyFromPublicUrl,
} from './paths';

const UUID = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b';

describe('isStorageKeyOwnedBy', () => {
    it('accepts a key built for the same owner', () => {
        const key = buildQuizStorageKey('q1', UUID);

        expect(isStorageKeyOwnedBy(key, { prefix: 'quiz', idPart: 'q1' })).toBe(
            true,
        );
    });

    it('rejects another owner whose id shares a prefix', () => {
        // `quiz/q1-x-<uuid>` принадлежит вопросу `q1-x`, а не `q1`.
        const key = buildQuizStorageKey('q1-x', UUID);

        expect(isStorageKeyOwnedBy(key, { prefix: 'quiz', idPart: 'q1' })).toBe(
            false,
        );
    });

    it('rejects another user avatar', () => {
        const key = buildAvatarStorageKey('userB', UUID);

        expect(
            isStorageKeyOwnedBy(key, { prefix: 'avatars', idPart: 'userA' }),
        ).toBe(false);
    });

    it('rejects the right id under a different prefix', () => {
        const key = buildAvatarStorageKey('abc', UUID);

        expect(isStorageKeyOwnedBy(key, { prefix: 'quiz', idPart: 'abc' })).toBe(
            false,
        );
    });

    it('rejects keys that do not follow the generated format', () => {
        expect(
            isStorageKeyOwnedBy('quiz/q1-not-a-uuid.webp', {
                prefix: 'quiz',
                idPart: 'q1',
            }),
        ).toBe(false);
        expect(
            isStorageKeyOwnedBy(`quiz/q1-${UUID}.png`, {
                prefix: 'quiz',
                idPart: 'q1',
            }),
        ).toBe(false);
    });

    it('rejects an empty owner id', () => {
        expect(
            isStorageKeyOwnedBy(`quiz/-${UUID}.webp`, {
                prefix: 'quiz',
                idPart: '  ',
            }),
        ).toBe(false);
    });
});

describe('storageKeyFromPublicUrl', () => {
    it('maps relative and absolute media URLs to the same key', () => {
        const key = buildQuizStorageKey('q1', UUID);

        expect(storageKeyFromPublicUrl(`/media/${key}`)).toBe(key);
        expect(
            storageKeyFromPublicUrl(`https://www.game-mind.ru/media/${key}`),
        ).toBe(key);
    });

    it('ignores seed images outside the media mount', () => {
        expect(
            storageKeyFromPublicUrl('/quiz-images/easy/example.webp'),
        ).toBeNull();
    });
});
