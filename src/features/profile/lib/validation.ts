import { z } from 'zod';

// те же правила, что в registerSchema (auth/lib/validation.ts)
const usernameField = z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be at most 20 characters')
    .regex(
        /^[a-zA-Z0-9_]+$/,
        'Username can only contain letters, numbers, and underscore',
    );

// поле для валидации пароля
const passwordField = z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password is too long');

export const changeUsernameSchema = z.object({
    username: usernameField,
});

// схема для изменения пароля пользователя
export const changePasswordSchema = z
    .object({
        currentPassword: z
            .string()
            .min(1, 'Current password is required')
            .max(72, 'Password is too long'),
        newPassword: passwordField,
        confirmNewPassword: z
            .string()
            .min(1, 'Please confirm your new password')
            .max(72, 'Password is too long'),
    })
    .refine((data) => data.newPassword === data.confirmNewPassword, {
        message: 'Passwords do not match',
        path: ['confirmNewPassword'],
    })
    .refine((data) => data.newPassword !== data.currentPassword, {
        message: 'New password must be different from the current password',
        path: ['newPassword'],
    });

export type ChangeUsernameInput = z.infer<typeof changeUsernameSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
