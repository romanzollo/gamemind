'use server';

import bcrypt from 'bcryptjs';
import { registerSchema } from '@/features/auth/lib/validation';
import { userRepository } from '@/entities/user/user.repository';
import type { AuthFormState } from '@/features/auth/types';

const BCRYPT_ROUNDS = 12;

export async function registerAction(
    _prevState: AuthFormState,
    formData: FormData,
): Promise<AuthFormState> {
    // Получаем данные из формы
    const raw = {
        username: formData.get('username'),
        email: formData.get('email'),
        password: formData.get('password'),
    };

    // Валидируем данные
    const parsed = registerSchema.safeParse(raw);

    // Если валидация не прошла, возвращаем ошибку
    if (!parsed.success) {
        const firstError = parsed.error.errors[0]?.message;
        return { error: firstError ?? 'Invalid form data' };
    }

    // Деструктуризация из валидированных данных
    const { username, email, password } = parsed.data;

    // Проверяем, не зарегистрирован ли email
    const existingByEmail = await userRepository.findByEmail(email);
    if (existingByEmail) {
        return { error: 'Email is already registered' };
    }

    // Проверяем, не зарегистрирован ли username
    const existingByUsername = await userRepository.findByUsername(username);
    if (existingByUsername) {
        return { error: 'Username is already taken' };
    }

    // Хешируем пароль
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    try {
        // Создаем пользователя
        await userRepository.create({
            username,
            email,
            passwordHash,
        });

        // Возвращаем успешный результат
        return { success: true };
    } catch (error) {
        console.error('Register failed:', error);
        return { error: 'Could not create account. Please try again.' };
    }
}
