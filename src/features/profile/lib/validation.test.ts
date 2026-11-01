/**
 * Unit-тесты «Задать пароль»: почта нужна только аккаунту без почты,
 * и её нельзя подсунуть аккаунту, у которого почта уже есть.
 */

import { describe, expect, it } from 'vitest';

import { createSetPasswordSchema } from './validation';

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
