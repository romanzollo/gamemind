import { logoutAction } from '@/features/auth/actions';
import { requireUser } from '@/lib/auth/guards';

// Страница профиля пользователя
export default async function ProfilePage() {
    // Проверяем, авторизован ли пользователь
    const session = await requireUser();

    return (
        <main className="mx-auto max-w-2xl p-8">
            <h1 className="text-2xl font-semibold">Profile</h1>

            <div className="mt-4 space-y-1 text-neutral-600 dark:text-neutral-400">
                <p>Username: {session.user.username}</p>
                <p>Email: {session.user.email}</p>
                <p>Role: {session.user.role}</p>
            </div>

            {/* Форма для выхода из системы */}
            <form action={logoutAction} className="mt-6">
                <button
                    type="submit"
                    className="rounded bg-neutral-900 px-4 py-2 text-white dark:bg-neutral-100 dark:text-neutral-900"
                >
                    Log out
                </button>
            </form>
        </main>
    );
}
