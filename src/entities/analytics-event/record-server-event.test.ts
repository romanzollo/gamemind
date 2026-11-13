import { describe, expect, it } from 'vitest';

import { authMethodOf } from './record-server-event';

describe('authMethodOf', () => {
    it('maps Auth.js providers to funnel sign-in methods', () => {
        expect(authMethodOf('credentials')).toBe('password');
        expect(authMethodOf('yandex')).toBe('yandex');
        expect(authMethodOf('vk')).toBe('vk');
    });

    it('ignores guests and unknown providers', () => {
        expect(authMethodOf('guest')).toBeNull();
        expect(authMethodOf('google')).toBeNull();
        expect(authMethodOf(undefined)).toBeNull();
    });
});
