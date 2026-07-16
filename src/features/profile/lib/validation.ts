import { z } from 'zod';

// поле для валидации пароля
const passwordField = z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password is too long');

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

// тип для валидации изменения пароля пользователя
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
