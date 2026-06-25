import { z } from 'zod';

// Валидация регистрации
export const registerSchema = z.object({
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
});

export type RegisterInput = z.infer<typeof registerSchema>;
