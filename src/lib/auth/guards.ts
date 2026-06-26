import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

export async function requireUser() {
    const session = await auth();

    if (!session?.user) {
        redirect('/login');
    }

    return session;
}

export async function requireAdmin() {
    const session = await requireUser();

    if (session.user.role !== 'ADMIN') {
        redirect('/profile');
    }

    return session;
}
