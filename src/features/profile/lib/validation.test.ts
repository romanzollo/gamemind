/**
 * Unit-тесты форм профиля: «Задать пароль» (почта нужна только аккаунту
 * без почты и не подсовывается тому, у кого она есть) и ник без `guest_`.
 */

import { describe, expect, it } from 'vitest';

import { changeUsernameSchema, createSetPasswordSchema } from './validation';

const passwords = {
    newPassword: 'secret-123',
    confirmNewPassword: 'secret-123',
};

describe('createSetPasswordSchema', () => {
    it('requires an email when the account has none', () => {
        const schema = createSetPasswordSchema(true);

        expect(schema.safeParse(passwords).success).toBe(false);
        expect(
            schema.safeParse({ ...passwords, email: ' Roman@VK.com ' }).data,
        ).toEqual({ ...passwords, email: 'roman@vk.com' });
    });

    it('rejects an email when the account already has one', () => {
        const schema = createSetPasswordSchema(false);

        expect(schema.safeParse(passwords).success).toBe(true);
        expect(
            schema.safeParse({ ...passwords, email: 'other@vk.com' }).success,
        ).toBe(false);
    });

    it('checks the password rules and the repeat', () => {
        const schema = createSetPasswordSchema(false);

        expect(
            schema.safeParse({ newPassword: 'short', confirmNewPassword: 'short' })
                .success,
        ).toBe(false);
        expect(
            schema.safeParse({ ...passwords, confirmNewPassword: 'secret-124' })
                .success,
        ).toBe(false);
    });
});

describe('changeUsernameSchema', () => {
    it('does not let a player take a guest_ name', () => {
        expect(changeUsernameSchema.safeParse({ username: 'guest_x1' }).success).toBe(
            false,
        );
        expect(changeUsernameSchema.safeParse({ username: 'Roman_Zollo' }).success).toBe(
            true,
        );
    });
});
