import bcrypt from 'bcryptjs';
import Credentials from 'next-auth/providers/credentials';
import { loginSchema } from '@/features/auth/lib/validation';
import { userRepository } from '@/entities/user/user.repository';

export const credentialsProvider = Credentials({
    id: 'credentials',
    name: 'credentials',
    credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
    },
    async authorize(credentials) {
        // Шаг 1: Валидация данных
        const parsed = loginSchema.safeParse(credentials);

        if (!parsed.success) {
            return null;
        }

        // Шаг 2: Извлечение валидированных данных
        const { email, password } = parsed.data;

        // Шаг 3: Поиск пользователя в БД
        const user = await userRepository.findByEmailForLogin(email);

        // Шаг 4: Проверка существования пользователя
        if (!user || !user.passwordHash) {
            return null;
        }

        // Soft-disable: неактивный пользователь не входит
        if (!user.isActive) {
            return null;
        }

        // Шаг 5: Сравнение паролей
        const isPasswordValid = await bcrypt.compare(
            password,
            user.passwordHash,
        );

        if (!isPasswordValid) {
            return null;
        }

        // Шаг 6: Успешный вход - возвращаем объект пользователя
        return {
            id: user.id,
            email: user.email,
            name: user.username,
            image: user.image,
            role: user.role,
        };
    },
});
