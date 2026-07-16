import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import { credentialsProvider } from './providers';

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
    ...authConfig,
    providers: [credentialsProvider],
});
