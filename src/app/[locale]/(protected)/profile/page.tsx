import { logoutAction } from '@/features/auth/actions';
import { ChangeAvatarForm } from '@/features/profile/components/ChangeAvatarForm';
import { ChangePasswordForm } from '@/features/profile/components/ChangePasswordForm';
import { ChangeUsernameForm } from '@/features/profile/components/ChangeUsernameForm';
import { ProfileResultHistory } from '@/features/profile/components/ProfileResultHistory';
import { ProfileStatsSummary } from '@/features/profile/components/ProfileStatsSummary';
import {
    PROFILE_RESULT_HISTORY_LIMIT,
    mapResultHistory,
    profileResultRepository,
} from '@/features/profile/lib';
import type { ProfileStats } from '@/features/profile/types/profile-stats';
import type { ProfileResultHistoryEntry } from '@/features/profile/types/result-history-entry';
import { requireUser } from '@/lib/auth/guards';
import { getDictionary, isLocale } from '@/shared/i18n';
import { InlineAlert, SubmitButton } from '@/shared/ui';

type ProfilePageProps = {
    params: Promise<{ locale: string }>;
};

const sectionClassName =
    'mt-8 border-t border-border pt-6 sm:mt-10 sm:pt-8';

const sectionHeadingClassName =
    'font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl';

export default async function ProfilePage({ params }: ProfilePageProps) {
    const { locale } = await params;
    const safeLocale = isLocale(locale) ? locale : 'ru';
    const dictionary = getDictionary(safeLocale);
    const session = await requireUser(safeLocale);

    let historyEntries: ProfileResultHistoryEntry[] = [];
    let historyLoadError: string | undefined;
    /** null = Neon/read failed; объект с quizzesCompleted=0 = ещё не играл. */
    let profileStats: ProfileStats | null = null;

    // Параллельно: история и сводка независимы — падение одной не ломает другую.
    const [historySettled, statsSettled] = await Promise.allSettled([
        profileResultRepository.findRecentByUserId(
            session.user.id,
            PROFILE_RESULT_HISTORY_LIMIT,
        ),
        profileResultRepository.findStatsByUserId(session.user.id),
    ]);

    if (historySettled.status === 'fulfilled') {
        historyEntries = mapResultHistory(historySettled.value);
    } else {
        historyLoadError = dictionary.profile.historyLoadFailed;
    }

    if (statsSettled.status === 'fulfilled') {
        profileStats = statsSettled.value;
    }

    return (
        <main className="mx-auto max-w-2xl px-4 py-5 sm:px-8 sm:py-10">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-4xl">
                {dictionary.profile.title}
            </h1>

            {/* Аккаунт: идентичность + выход + смена имени */}
            <section
                className="mt-6 sm:mt-8"
                aria-labelledby="profile-account-title"
            >
                <h2
                    id="profile-account-title"
                    className={sectionHeadingClassName}
                >
                    {dictionary.profile.sectionAccount}
                </h2>

                <dl className="mt-4 space-y-2 rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-5">
                    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                        <dt className="text-sm font-medium text-muted sm:w-40 sm:shrink-0">
                            {dictionary.profile.username}
                        </dt>
                        <dd className="text-foreground">
                            {session.user.username}
                        </dd>
                    </div>
                    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                        <dt className="text-sm font-medium text-muted sm:w-40 sm:shrink-0">
                            {dictionary.profile.email}
                        </dt>
                        <dd className="break-all text-foreground">
                            {session.user.email}
                        </dd>
                    </div>
                    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                        <dt className="text-sm font-medium text-muted sm:w-40 sm:shrink-0">
                            {dictionary.profile.role}
                        </dt>
                        <dd className="font-mono text-sm tabular-nums text-foreground">
                            {session.user.role}
                        </dd>
                    </div>
                </dl>

                <form action={logoutAction} className="mt-4">
                    <input type="hidden" name="locale" value={safeLocale} />
                    <SubmitButton
                        variant="secondary"
                        pendingLabel={dictionary.common.working}
                    >
                        {dictionary.profile.logout}
                    </SubmitButton>
                </form>

                <ChangeUsernameForm
                    locale={safeLocale}
                    dictionary={dictionary}
                    currentUsername={session.user.username}
                />
            </section>

            {/*
              Игровой прогресс сразу после аккаунта: на мобиле сводка/история
              не прячутся под длинными формами аватара и пароля.
            */}
            <section
                className={sectionClassName}
                aria-labelledby="profile-stats-title"
            >
                <h2
                    id="profile-stats-title"
                    className={sectionHeadingClassName}
                >
                    {dictionary.profile.statsTitle}
                </h2>

                <ProfileStatsSummary
                    stats={profileStats}
                    locale={safeLocale}
                    labels={dictionary.profile}
                />
            </section>

            <section
                className={sectionClassName}
                aria-labelledby="profile-history-title"
            >
                <h2
                    id="profile-history-title"
                    className={sectionHeadingClassName}
                >
                    {dictionary.profile.historyTitle}
                </h2>

                {historyLoadError ? (
                    <InlineAlert className="mt-4">{historyLoadError}</InlineAlert>
                ) : null}

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

            {/* Настройки аккаунта ниже прогресса */}
            <section
                className={sectionClassName}
                aria-labelledby="profile-avatar-title"
            >
                <h2
                    id="profile-avatar-title"
                    className={sectionHeadingClassName}
                >
                    {dictionary.profile.changeAvatarTitle}
                </h2>

                <ChangeAvatarForm
                    locale={safeLocale}
                    dictionary={dictionary}
                    currentImageUrl={session.user.image ?? null}
                />
            </section>

            <section
                className={sectionClassName}
                aria-labelledby="profile-security-title"
            >
                <h2
                    id="profile-security-title"
                    className={sectionHeadingClassName}
                >
                    {dictionary.profile.sectionSecurity}
                </h2>

                <ChangePasswordForm
                    locale={safeLocale}
                    dictionary={dictionary}
                />
            </section>
        </main>
    );
}
