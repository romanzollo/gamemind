import { logoutAction } from '@/features/auth/actions';
import { requireUser } from '@/lib/auth/guards';
import { getDictionary, isLocale } from '@/shared/i18n';

type ProfilePageProps = {
    params: Promise<{ locale: string }>;
};

export default async function ProfilePage({ params }: ProfilePageProps) {
    const { locale } = await params;
    const safeLocale = isLocale(locale) ? locale : 'ru';
    const dictionary = getDictionary(safeLocale);
    const session = await requireUser(safeLocale);

    return (
        <main className="mx-auto max-w-2xl p-8">
            <h1 className="text-2xl font-semibold">
                {dictionary.profile.title}
            </h1>

            <div className="mt-4 space-y-1 text-neutral-600 dark:text-neutral-400">
                <p>
                    {dictionary.profile.username}: {session.user.username}
                </p>
                <p>
                    {dictionary.profile.email}: {session.user.email}
                </p>
                <p>
                    {dictionary.profile.role}: {session.user.role}
                </p>
            </div>

            <form action={logoutAction} className="mt-6">
                <input type="hidden" name="locale" value={safeLocale} />
                <button
                    type="submit"
                    className="rounded bg-neutral-900 px-4 py-2 text-white dark:bg-neutral-100 dark:text-neutral-900"
                >
                    {dictionary.profile.logout}
                </button>
            </form>
        </main>
    );
}
