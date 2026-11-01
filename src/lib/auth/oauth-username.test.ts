/**
 * Unit-тесты ника для внешнего входа: результат всегда проходит правила
 * регистрации (латиница, цифры, `_`, 3–20 символов).
 */

import { describe, expect, it } from 'vitest';

import { registerSchema } from '@/features/auth/lib/validation';
import { toUsernameBase, withUsernameSuffix } from './oauth-username';

function passesRegisterRules(username: string): boolean {
    return registerSchema.safeParse({
        username,
        email: 'a@b.cd',
        password: '12345678',
        confirmPassword: '12345678',
    }).success;
}

describe('toUsernameBase', () => {
    it('keeps an ASCII login as is', () => {
        expect(toUsernameBase('romanzollo')).toBe('romanzollo');
    });

    it('turns dots and dashes into underscores', () => {
        expect(toUsernameBase('ivan.petrov-91')).toBe('ivan_petrov_91');
    });

    it('transliterates Cyrillic and keeps capitals', () => {
        expect(toUsernameBase('Роман Щукин')).toBe('Roman_Shchukin');
        expect(toUsernameBase('Юля')).toBe('Yulya');
    });

    it('cuts an email at @ so the address never shows up', () => {
        expect(toUsernameBase('gamer@yandex.ru')).toBe('gamer');
    });

    it('limits the length to 20 without a trailing underscore', () => {
        const base = toUsernameBase('abcdefghijklmnopqrs tuvwxyz');
        expect(base).toBe('abcdefghijklmnopqrs');
        expect(base.length).toBeLessThanOrEqual(20);
    });

    it('falls back to player when nothing usable is left', () => {
        expect(toUsernameBase(null)).toBe('player');
        expect(toUsernameBase('')).toBe('player');
        expect(toUsernameBase('🎮🎮')).toBe('player');
        expect(toUsernameBase('ab')).toBe('player');
    });

    it('does not hand out the reserved guest_ prefix', () => {
        expect(toUsernameBase('guest_777')).toBe('player');
        expect(toUsernameBase('Guest.Star')).toBe('player');
    });

    it('always passes the registration rules', () => {
        for (const raw of [
            'romanzollo',
            'Роман Щукин',
            'ёжик в тумане и ещё очень длинное имя',
            '___',
            'a.b.c.d.e.f.g.h.i.j.k.l',
        ]) {
            expect(passesRegisterRules(toUsernameBase(raw))).toBe(true);
        }
    });
});

describe('withUsernameSuffix', () => {
    it('adds the suffix after an underscore', () => {
        expect(withUsernameSuffix('roman', '4821')).toBe('roman_4821');
    });

    it('shortens the base so the result fits 20 characters', () => {
        const name = withUsernameSuffix('abcdefghijklmnopqrst', '4821');
        expect(name).toBe('abcdefghijklmno_4821');
        expect(passesRegisterRules(name)).toBe(true);
    });

    it('does not leave a double underscore after shortening', () => {
        expect(withUsernameSuffix('abcdefghijklmno_pqrs', '4821')).toBe(
            'abcdefghijklmno_4821',
        );
        expect(withUsernameSuffix('abcdefghijklmn_opqrs', '4821')).toBe(
            'abcdefghijklmn_4821',
        );
    });
});
