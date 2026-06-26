import { requireAdmin } from '@/lib/auth/guards';

// Страница управления вопросами для админа
export default async function AdminQuestionsPage() {
    // Проверяем, авторизован ли пользователь и является ли он админом
    const session = await requireAdmin();

    return (
        <main className="mx-auto max-w-3xl p-8">
            <h1 className="text-2xl font-semibold">Manage questions</h1>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
                Admin-only area. Signed in as {session.user.username}.
            </p>
        </main>
    );
}
