import { z } from 'zod';

// Валидация регистрации
export const registerSchema = z
    .object({
        username: z
            .string()
            .trim()
            .min(3, 'Username must be at least 3 characters')
            .max(20, 'Username must be at most 20 characters')
            .regex(
                /^[a-zA-Z0-9_]+$/,
                'Username can only contain letters, numbers, and underscore',
            ),
        email: z.string().trim().toLowerCase().email('Invalid email address'),
        password: z
            .string()
            .min(8, 'Password must be at least 8 characters')
            .max(72, 'Password is too long'),
        confirmPassword: z
            .string()
            .min(1, 'Please confirm your password')
            .max(72, 'Password is too long'),
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: 'Passwords do not match',
        path: ['confirmPassword'],
    });

// Валидация логина
export const loginSchema = z.object({
    email: z.string().trim().toLowerCase().email('Invalid email address'),
    password: z
        .string()
        .min(1, 'Password is required')
        .max(72, 'Password is too long'),
});

// Типы
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
