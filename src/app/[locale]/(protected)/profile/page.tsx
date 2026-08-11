import { logoutAction } from '@/features/auth/actions';
import { ProfileAchievementsList } from '@/features/achievements/components/ProfileAchievementsList';
import { getAchievementProgressForUser } from '@/features/achievements/lib/get-achievement-progress';
import type { AchievementProgress } from '@/features/achievements/types';
import { ChangeAvatarForm } from '@/features/profile/components/ChangeAvatarForm';
import { ChangePasswordForm } from '@/features/profile/components/ChangePasswordForm';
import { ChangeUsernameForm } from '@/features/profile/components/ChangeUsernameForm';
import { ProfileFoldSection } from '@/features/profile/components/ProfileFoldSection';
import { ProfileResultHistory } from '@/features/profile/components/ProfileResultHistory';
import { ProfileSettingsSection } from '@/features/profile/components/ProfileSettingsSection';
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
import { InlineAlert, SubmitButton, UserAvatar } from '@/shared/ui';

type ProfilePageProps = {
    params: Promise<{ locale: string }>;
};

const sectionHeadingClassName =
    'font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl';

/**
 * Профиль: identity strip → progress (stats+achievements | history) → settings.
 *
 * IA: игровой прогресс выше форм; на lg mid = 2 колонки (меньше скролла).
 * Mobile: ачивки и история — складки как настройки (не раздувают экран).
 * Settings в Client `<details>`, чтобы soft refresh не схлопывал блок.
 */
export default async function ProfilePage({ params }: ProfilePageProps) {
    const { locale } = await params;
    const safeLocale = isLocale(locale) ? locale : 'ru';
    const dictionary = getDictionary(safeLocale);
    const session = await requireUser(safeLocale);

    let historyEntries: ProfileResultHistoryEntry[] = [];
    let historyLoadError: string | undefined;
    /** null = Neon/read failed; объект с quizzesCompleted=0 = ещё не играл. */
    let profileStats: ProfileStats | null = null;
    /** null = Neon/read failed; объект = полный каталог. */
    let achievementProgress: AchievementProgress | null = null;

    /*
     * Не Promise.allSettled трёх withDirectPgClient: в next dev общая очередь,
     * параллельные waiters клинят start (см. QUIZ_NEON_HOT_PATH, waiters≥3).
     * Последовательные soft-fail чтения — один hop за раз.
     */
    try {
        historyEntries = mapResultHistory(
            await profileResultRepository.findRecentByUserId(
                session.user.id,
                PROFILE_RESULT_HISTORY_LIMIT,
            ),
        );
    } catch {
        historyLoadError = dictionary.profile.historyLoadFailed;
    }

    try {
        profileStats = await profileResultRepository.findStatsByUserId(
            session.user.id,
        );
    } catch (error) {
        console.error('Profile stats load failed:', error);
        profileStats = null;
    }

    try {
        achievementProgress = await getAchievementProgressForUser(
            session.user.id,
        );
    } catch (error) {
        console.error('Profile achievements load failed:', error);
        achievementProgress = null;
    }

    const unlockedCount =
        achievementProgress?.items.filter((item) => item.unlockedAt !== null)
            .length ?? 0;
    const totalAchievements = achievementProgress?.items.length ?? 0;
    const achievementsCountLabel =
        totalAchievements > 0
            ? dictionary.achievements.progressCount
                  .replace('{unlocked}', String(unlockedCount))
                  .replace('{total}', String(totalAchievements))
            : null;

    return (
        <main className="mx-auto max-w-2xl px-4 py-5 sm:px-8 sm:py-10 lg:max-w-5xl">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-4xl">
                {dictionary.profile.title}
            </h1>

            {/* Компактная полоса идентичности — без длинного dl и форм */}
            <section
                className="mt-6 border border-border border-l-4 border-l-primary bg-surface p-3 sm:mt-8 sm:p-4"
                aria-labelledby="profile-account-title"
            >
                <h2 id="profile-account-title" className="sr-only">
                    {dictionary.profile.sectionAccount}
                </h2>

                <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                    <UserAvatar
                        src={session.user.image}
                        alt=""
                        size="sm"
                        className="!h-12 !w-12"
                    />

                    <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                            {session.user.username}
                        </p>
                        <p className="truncate text-sm text-muted">
                            {session.user.email}
                        </p>
                        <p className="mt-0.5 font-mono text-xs tabular-nums text-muted">
                            {session.user.role}
                        </p>
                    </div>

                    <form action={logoutAction} className="shrink-0">
                        <input type="hidden" name="locale" value={safeLocale} />
                        <SubmitButton
                            variant="secondary"
                            pendingLabel={dictionary.common.working}
                        >
                            {dictionary.profile.logout}
                        </SubmitButton>
                    </form>
                </div>
            </section>

            {/*
              Progress mid: stats всегда видны; ниже — меню-лента складок
              (ачивки | история) → settings. На lg: 2 колонки без «простыни».
            */}
            <div className="mt-8 sm:mt-10">
                <section aria-labelledby="profile-stats-title">
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

                <div className="mt-6 border-t border-border lg:mt-10 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-10 lg:border-t-0">
                    <div className="lg:sticky lg:top-24 lg:self-start">
                        <ProfileFoldSection
                            title={dictionary.achievements.sectionTitle}
                            titleId="profile-achievements-title"
                            trailing={achievementsCountLabel}
                        >
                            <ProfileAchievementsList
                                progress={achievementProgress}
                                locale={safeLocale}
                                labels={dictionary.achievements}
                            />
                        </ProfileFoldSection>
                    </div>

                    <ProfileFoldSection
                        title={dictionary.profile.historyTitle}
                        titleId="profile-history-title"
                    >
                        {historyLoadError ? (
                            <InlineAlert className="mt-1" tone="warning">
                                {historyLoadError}
                            </InlineAlert>
                        ) : null}

                        {!historyLoadError && (
                            <div className="lg:mt-3 lg:max-h-[min(70vh,36rem)] lg:overflow-y-auto lg:overscroll-contain">
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
                            </div>
                        )}
                    </ProfileFoldSection>
                </div>

                {/* Client details: open state переживает revalidate/refresh */}
                <ProfileSettingsSection
                    title={dictionary.profile.sectionSettings}
                >
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

                    <ChangePasswordForm
                        locale={safeLocale}
                        dictionary={dictionary}
                    />
                </ProfileSettingsSection>
            </div>
        </main>
    );
}
