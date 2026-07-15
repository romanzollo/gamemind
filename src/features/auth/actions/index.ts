'use server';

import bcrypt from 'bcryptjs'; // Библиотека для хеширования паролей
import { AuthError } from 'next-auth'; // Типы ошибок NextAuth
import { signIn, signOut } from '@/lib/auth'; // Функции входа и выхода из системы

import { registerSchema } from '@/features/auth/lib/validation';
import { userRepository } from '@/entities/user/user.repository';
import type { AuthFormState } from '@/features/auth/types';
import { loginSchema } from '@/features/auth/lib/validation';
import { defaultLocale, isLocale, type Locale } from '@/shared/i18n';

const BCRYPT_ROUNDS = 12; // Соль для bcrypt (стандарт: 10-12)

function getLocaleFromFormData(formData: FormData): Locale {
    const locale = formData.get('locale');

    return typeof locale === 'string' && isLocale(locale)
        ? locale
        : defaultLocale;
}

export async function registerAction(
    _prevState: AuthFormState,
    formData: FormData,
): Promise<AuthFormState> {
    const locale = getLocaleFromFormData(formData);

    // Получаем данные из формы
    const raw = {
        username: formData.get('username'),
        email: formData.get('email'),
        password: formData.get('password'),
        confirmPassword: formData.get('confirmPassword'),
    };

    // Валидируем данные (включая совпадение паролей)
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
    } catch (error) {
        console.error('Register failed:', error);
        return { error: 'Could not create account. Please try again.' };
    }

    // Сразу логиним — без повторного ввода пароля
    try {
        await signIn('credentials', {
            email,
            password,
            redirectTo: `/${locale}`,
        });
    } catch (error) {
        if (error instanceof AuthError) {
            // Аккаунт уже создан; просим войти вручную
            return {
                error: 'Account created, but automatic login failed. Please sign in.',
            };
        }
        // signIn с redirectTo бросает NEXT_REDIRECT — это нормальный редирект
        throw error;
    }

    return {};
}

// Действие для входа в систему
export async function loginAction(
    _prevState: AuthFormState,
    formData: FormData,
): Promise<AuthFormState> {
    // Валидируем данные
    const parsed = loginSchema.safeParse({
        email: formData.get('email'),
        password: formData.get('password'),
    });
    const locale = getLocaleFromFormData(formData);

    // Если валидация не прошла, возвращаем ошибку
    if (!parsed.success) {
        const firstError = parsed.error.errors[0]?.message;
        return { error: firstError ?? 'Invalid form data' };
    }

    try {
        // Входим в систему
        await signIn('credentials', {
            email: parsed.data.email,
            password: parsed.data.password,
            redirectTo: `/${locale}/profile`,
        });
    } catch (error) {
        // Обработка ошибок
        if (error instanceof AuthError) {
            if (error.type === 'CredentialsSignin') {
                // Не раскрываем, существует ли email — базовая security-практика.
                return { error: 'Invalid email or password' };
            }
            return { error: 'Something went wrong. Please try again.' };
        }
        // signIn с redirectTo бросает NEXT_REDIRECT — это не ошибка, а нормальный редирект. Его нужно пробросить дальше.
        throw error;
    }
    return {};
}

// Действие для выхода из системы
export async function logoutAction(formData: FormData) {
    const locale = getLocaleFromFormData(formData);

    // Выходим из системы и перенаправляем на главную страницу
    await signOut({ redirectTo: `/${locale}` });
}
