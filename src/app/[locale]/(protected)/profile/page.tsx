import { logoutAction } from '@/features/auth/actions';
import { ProfileAchievementsList } from '@/features/achievements/components/ProfileAchievementsList';
import { getAchievementProgressForUser } from '@/features/achievements/lib/get-achievement-progress';
import type { AchievementProgress } from '@/features/achievements/types';
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
 * Settings в <details>, чтобы не раздувать первый экран.
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
    /** null = Neon/read failed после catch-up; объект = полный каталог. */
    let achievementProgress: AchievementProgress | null = null;

    const [historySettled, statsSettled, achievementsSettled] =
        await Promise.allSettled([
            profileResultRepository.findRecentByUserId(
                session.user.id,
                PROFILE_RESULT_HISTORY_LIMIT,
            ),
            profileResultRepository.findStatsByUserId(session.user.id),
            getAchievementProgressForUser(session.user.id),
        ]);

    if (historySettled.status === 'fulfilled') {
        historyEntries = mapResultHistory(historySettled.value);
    } else {
        historyLoadError = dictionary.profile.historyLoadFailed;
    }

    if (statsSettled.status === 'fulfilled') {
        profileStats = statsSettled.value;
    }

    if (achievementsSettled.status === 'fulfilled') {
        achievementProgress = achievementsSettled.value;
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
              Progress mid: на мобилке колонка; на lg — stats+ачивки | история
              рядом, чтобы не скроллить «потоком» одинаковых блоков.
            */}
            <div className="mt-8 grid gap-8 sm:mt-10 lg:grid-cols-2 lg:items-start lg:gap-x-10">
                {/* Левая колонка sticky: сводка+ачивки не «уплывают» при длинной истории */}
                <div className="space-y-8 lg:sticky lg:top-24 lg:self-start">
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

                    <section aria-labelledby="profile-achievements-title">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                            <h2
                                id="profile-achievements-title"
                                className={sectionHeadingClassName}
                            >
                                {dictionary.achievements.sectionTitle}
                            </h2>
                            {achievementsCountLabel ? (
                                <p className="font-mono text-sm tabular-nums tracking-tight text-muted">
                                    {achievementsCountLabel}
                                </p>
                            ) : null}
                        </div>

                        <ProfileAchievementsList
                            progress={achievementProgress}
                            locale={safeLocale}
                            labels={dictionary.achievements}
                        />
                    </section>
                </div>

                <section
                    className="border-t border-border pt-8 lg:border-t-0 lg:pt-0"
                    aria-labelledby="profile-history-title"
                >
                    <h2
                        id="profile-history-title"
                        className={sectionHeadingClassName}
                    >
                        {dictionary.profile.historyTitle}
                    </h2>

                    {historyLoadError ? (
                        <InlineAlert className="mt-4">
                            {historyLoadError}
                        </InlineAlert>
                    ) : null}

                    {!historyLoadError && (
                        <div className="mt-3 lg:max-h-[min(70vh,36rem)] lg:overflow-y-auto lg:overscroll-contain">
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
                </section>
            </div>

            {/* Настройки ниже прогресса и по умолчанию свёрнуты */}
            <details className="group mt-8 border-t border-border pt-6 sm:mt-10 sm:pt-8">
                <summary className="cursor-pointer list-none font-display text-xl font-semibold tracking-tight text-foreground marker:content-none sm:text-2xl [&::-webkit-details-marker]:hidden">
                    <span className="inline-flex items-center gap-2">
                        {dictionary.profile.sectionSettings}
                        <span
                            className="font-mono text-sm font-normal text-muted transition-transform group-open:rotate-90"
                            aria-hidden
                        >
                            ›
                        </span>
                    </span>
                </summary>

                <div className="mt-6 space-y-8">
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
                </div>
            </details>
        </main>
    );
}
