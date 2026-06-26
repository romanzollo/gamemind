import type { DefaultSession } from 'next-auth';
import type { Role } from '@prisma/client';

// Определение типов для next-auth
declare module 'next-auth' {
    interface Session {
        user: {
            id: string;
            username: string;
            role: Role;
        } & DefaultSession['user'];
    }

    interface User {
        role: Role;
    }
}

// Определение типов для next-auth/jwt
declare module 'next-auth/jwt' {
    interface JWT {
        id: string;
        username: string;
        role: Role;
    }
}
