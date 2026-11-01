import type { DefaultSession } from 'next-auth';
import type { Role } from '@prisma/client';

// Определение типов для next-auth
declare module 'next-auth' {
    interface Session {
        user: {
            id: string;
            username: string;
            role: Role;
            /** Гость (3.4): Классика и Челлендж, без рейтингов. */
            isGuest: boolean;
        } & DefaultSession['user'];
    }

    interface User {
        role: Role;
        /** Только у гостевого провайдера; остальные — undefined (= не гость). */
        isGuest?: boolean;
    }
}

// Определение типов для next-auth/jwt
declare module 'next-auth/jwt' {
    interface JWT {
        id: string;
        username: string;
        role: Role;
        /** Нет в токенах, выданных до 3.4 — читать как false. */
        isGuest?: boolean;
    }
}
