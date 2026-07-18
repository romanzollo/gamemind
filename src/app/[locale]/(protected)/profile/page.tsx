import { logoutAction } from '@/features/auth/actions';
import { ChangeAvatarForm } from '@/features/profile/components/ChangeAvatarForm';
import { ChangePasswordForm } from '@/features/profile/components/ChangePasswordForm';
import { ChangeUsernameForm } from '@/features/profile/components/ChangeUsernameForm';
import { ProfileResultHistory } from '@/features/profile/components/ProfileResultHistory';
import {
    PROFILE_RESULT_HISTORY_LIMIT,
    mapResultHistory,
    profileResultRepository,
} from '@/features/profile/lib';
import type { ProfileResultHistoryEntry } from '@/features/profile/types/result-history-entry';
import { requireUser } from '@/lib/auth/guards';
import { getDictionary, isLocale } from '@/shared/i18n';
import { SubmitButton } from '@/shared/ui';

type ProfilePageProps = {
    params: Promise<{ locale: string }>;
};

export default async function ProfilePage({ params }: ProfilePageProps) {
    const { locale } = await params;
    const safeLocale = isLocale(locale) ? locale : 'ru';
    const dictionary = getDictionary(safeLocale);
    const session = await requireUser(safeLocale);

    let historyEntries: ProfileResultHistoryEntry[] = [];
    let historyLoadError: string | undefined;

    try {
        const rows = await profileResultRepository.findRecentByUserId(
            session.user.id,
            PROFILE_RESULT_HISTORY_LIMIT,
        );
        historyEntries = mapResultHistory(rows);
    } catch {
        historyLoadError = dictionary.profile.historyLoadFailed;
    }

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
                <SubmitButton
                    pendingLabel={dictionary.common.working}
                    className="rounded bg-neutral-900 px-4 py-2 text-white transition hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300 dark:focus-visible:outline-neutral-100"
                >
                    {dictionary.profile.logout}
                </SubmitButton>
            </form>

            <ChangeUsernameForm
                locale={safeLocale}
                dictionary={dictionary}
                currentUsername={session.user.username}
            />

            <ChangeAvatarForm
                locale={safeLocale}
                dictionary={dictionary}
                currentImageUrl={session.user.image ?? null}
            />

            <ChangePasswordForm locale={safeLocale} dictionary={dictionary} />

            <section className="mt-10">
                <h2 className="text-xl font-semibold">
                    {dictionary.profile.historyTitle}
                </h2>

                {historyLoadError && (
                    <p className="mt-4 text-red-600" role="alert">
                        {historyLoadError}
                    </p>
                )}

                {!historyLoadError && (
                    <ProfileResultHistory
                        entries={historyEntries}
                        locale={safeLocale}
                        labels={dictionary.profile}
                        difficultyLabels={{
                            easy: dictionary.quiz.easy,
                            medium: dictionary.quiz.medium,
                            hard: dictionary.quiz.hard,
                        }}
                    />
                )}
            </section>
        </main>
    );
}
