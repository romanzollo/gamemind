import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

export default async function ProfilePage() {
    const session = await auth();

    if (!session?.user) {
        redirect('/login');
    }

    return (
        <main className="mx-auto max-w-2xl p-8">
            <h1 className="text-2xl font-semibold">Profile</h1>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
                {session.user.username} ({session.user.email})
            </p>
            <p className="mt-1 text-sm text-neutral-500">
                Role: {session.user.role}
            </p>
        </main>
    );
}
