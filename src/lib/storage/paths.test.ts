import { describe, expect, it } from 'vitest';

import {
    buildAvatarStorageKey,
    buildQuizStorageKey,
    isStorageKeyOwnedBy,
    quizMediaOwner,
    storageKeyFromPublicUrl,
} from './paths';

const UUID = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b';
const SECRET = 'test-secret';

describe('isStorageKeyOwnedBy', () => {
    it('accepts a key built for the same owner', () => {
        const key = buildQuizStorageKey('q1', UUID, SECRET);

        expect(isStorageKeyOwnedBy(key, quizMediaOwner('q1', SECRET))).toBe(
            true,
        );
    });

    it('rejects another owner whose id shares a prefix', () => {
        const key = buildQuizStorageKey('q1-x', UUID, SECRET);

        expect(isStorageKeyOwnedBy(key, quizMediaOwner('q1', SECRET))).toBe(
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

describe('quizMediaOwner', () => {
    it('keeps the question id out of the object key', () => {
        // id импортированного IMAGE_GUESS содержит название игры — ответ.
        const key = buildQuizStorageKey('img-med-bg3', UUID, SECRET);

        expect(key).not.toContain('bg3');
        expect(key).toMatch(new RegExp(`^quiz/[0-9a-f]{16}-${UUID}\\.webp$`));
    });

    it('is stable per question and differs between questions and secrets', () => {
        const owner = quizMediaOwner('q1', SECRET);

        expect(quizMediaOwner('q1', SECRET)).toEqual(owner);
        expect(quizMediaOwner('q2', SECRET).idPart).not.toBe(owner.idPart);
        expect(quizMediaOwner('q1', 'other-secret').idPart).not.toBe(
            owner.idPart,
        );
    });

    it('requires a secret', () => {
        const previous = process.env.AUTH_SECRET;
        delete process.env.AUTH_SECRET;
        try {
            expect(() => quizMediaOwner('q1')).toThrow(/AUTH_SECRET/);
        } finally {
            if (previous !== undefined) process.env.AUTH_SECRET = previous;
        }
    });
});

describe('storageKeyFromPublicUrl', () => {
    it('maps relative and absolute media URLs to the same key', () => {
        const key = buildQuizStorageKey('q1', UUID, SECRET);

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
