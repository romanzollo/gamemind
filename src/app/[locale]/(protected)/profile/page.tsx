import { Suspense } from 'react';
import {
    userRepository,
    type SignInMethods,
} from '@/entities/user/user.repository';
import { logoutAction } from '@/features/auth/actions';
import { SaveGuestProgress } from '@/features/auth/components/SaveGuestProgress';
import { getOAuthErrorMessage } from '@/features/auth/lib/get-oauth-error-message';
import { ProfileAchievementsList } from '@/features/achievements/components/ProfileAchievementsList';
import { StripUnlockedQuery } from '@/features/achievements/components/StripUnlockedQuery';
import { getAchievementProgressForUser } from '@/features/achievements/lib/get-achievement-progress';
import { parseUnlockedQuery } from '@/features/achievements/lib/parse-unlocked-query';
import type { AchievementProgress } from '@/features/achievements/types';
import { ChangeAvatarForm } from '@/features/profile/components/ChangeAvatarForm';
import { ChangePasswordForm } from '@/features/profile/components/ChangePasswordForm';
import { ChangeUsernameForm } from '@/features/profile/components/ChangeUsernameForm';
import { ProfileFoldSection } from '@/features/profile/components/ProfileFoldSection';
import { ProfileResultHistory } from '@/features/profile/components/ProfileResultHistory';
import { ProfileSettingsRow } from '@/features/profile/components/ProfileSettingsRow';
import { ProfileSettingsSection } from '@/features/profile/components/ProfileSettingsSection';
import { RatingProfileWeek } from '@/features/leaderboard/components/rating-profile-week';
import { ProfileStatsSummary } from '@/features/profile/components/ProfileStatsSummary';
import { SetPasswordForm } from '@/features/profile/components/SetPasswordForm';
import { SignInMethodsList } from '@/features/profile/components/SignInMethodsList';
import {
    PROFILE_RESULT_HISTORY_LIMIT,
    mapResultHistory,
    profileResultRepository,
} from '@/features/profile/lib';
import type { ProfileStats } from '@/features/profile/types/profile-stats';
import type { ProfileResultHistoryEntry } from '@/features/profile/types/result-history-entry';
import { requireUser } from '@/lib/auth/guards';
import { VK_ID_PROVIDER_ID } from '@/lib/auth/vk-id';
import { getDictionary, isLocale, type Dictionary } from '@/shared/i18n';
import {
    buttonClassName,
    InlineAlert,
    PendingLink,
    SubmitButton,
    UserAvatar,
} from '@/shared/ui';
import { getAvatarPattern } from '@/shared/ui/avatar-pattern';

type ProfilePageProps = {
    params: Promise<{ locale: string }>;
    /**
     * `unlocked` — коды из ссылки unlock-тоста (только подсветка, не unlock).
     * `signInError` — ошибка привязки входа, пересланная страницей входа.
     */
    searchParams: Promise<{
        unlocked?: string | string[];
        signInError?: string | string[];
    }>;
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
/** «Почта, Яндекс ID» — подключённые входы для строки настроек. */
function describeSignInMethods(methods: SignInMethods, dictionary: Dictionary): string {
    const names: string[] = [];
    if (methods.hasPassword) names.push(dictionary.profile.email);
    if (methods.providers.includes('yandex')) names.push('Яндекс ID');
    if (methods.providers.includes(VK_ID_PROVIDER_ID)) names.push('VK ID');
    return names.join(', ');
}

export default async function ProfilePage({
    params,
    searchParams,
}: ProfilePageProps) {
    const { locale } = await params;
    const safeLocale = isLocale(locale) ? locale : 'ru';
    const dictionary = getDictionary(safeLocale);
    const session = await requireUser(safeLocale);
    const avatarPattern = getAvatarPattern(session.user.id);
    // Неизвестные коды отброшены; «Новое» список ставит только реально открытым.
    const query = await searchParams;
    const highlightCodes = parseUnlockedQuery(query.unlocked);
    const signInErrorMessage = getOAuthErrorMessage(
        dictionary,
        query.signInError,
    );

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

    // Гостю пароль и способы входа не показываем — у него «Сохрани прогресс».
    const isGuest = session.user.isGuest;

    /** null = чтение не удалось: блок способов входа скрыт, пароль — как раньше. */
    let signInMethods: SignInMethods | null = null;
    if (!isGuest) {
        try {
            signInMethods = await userRepository.findSignInMethods(
                session.user.id,
            );
        } catch (error) {
            console.error('Profile sign-in methods load failed:', error);
        }
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
                        pattern={avatarPattern}
                        alt=""
                        size="sm"
                        className="!h-12 !w-12"
                    />

                    {/* min-w: на узком экране кнопки уходят строкой ниже, а не сжимают ник до «a…» */}
                    <div className="min-w-[9rem] flex-1">
                        <p className="flex min-w-0 items-center gap-2">
                            <span className="truncate font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                                {session.user.username}
                            </span>
                            {/* Роль видна только админу; игроку слово USER ничего не говорит. */}
                            {session.user.role === 'ADMIN' ? (
                                <span className="shrink-0 rounded-sm bg-primary/10 px-2 py-0.5 text-2xs font-semibold tracking-wide text-primary">
                                    {dictionary.nav.admin}
                                </span>
                            ) : null}
                        </p>
                        {/* Почты нет у гостя и у входа через VK ID без email */}
                        {session.user.email ? (
                            <p className="truncate text-sm text-muted">
                                {session.user.email}
                            </p>
                        ) : null}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                        {/* На телефоне в шапке нет пункта «Админ» — вход в админку здесь */}
                        {session.user.role === 'ADMIN' ? (
                            <PendingLink
                                href={`/${safeLocale}/admin`}
                                className={buttonClassName({
                                    variant: 'secondary',
                                    className: 'lg:hidden',
                                })}
                            >
                                {dictionary.nav.admin}
                            </PendingLink>
                        ) : null}

                        {/* С lg «Выйти» есть в шапке — второй кнопки не нужно. */}
                        <form action={logoutAction} className="lg:hidden">
                            <input
                                type="hidden"
                                name="locale"
                                value={safeLocale}
                            />
                            <SubmitButton
                                variant="secondary"
                                pendingLabel={dictionary.common.working}
                            >
                                {dictionary.profile.logout}
                            </SubmitButton>
                        </form>
                    </div>
                </div>
            </section>

            {isGuest ? (
                <SaveGuestProgress
                    locale={safeLocale}
                    errorMessage={signInErrorMessage}
                    className="mt-4"
                />
            ) : null}

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
                    {isGuest ? null : (
                        <Suspense fallback={null}>
                            <RatingProfileWeek
                                userId={session.user.id}
                                locale={safeLocale}
                                dictionary={dictionary}
                            />
                        </Suspense>
                    )}
                </section>

                <div className="mt-6 border-t border-border lg:mt-10 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-10 lg:border-t-0">
                    <div className="lg:sticky lg:top-24 lg:self-start">
                        <ProfileFoldSection
                            title={dictionary.achievements.sectionTitle}
                            titleId="profile-achievements-title"
                            trailing={achievementsCountLabel}
                            defaultOpen={highlightCodes.length > 0}
                        >
                            <ProfileAchievementsList
                                progress={achievementProgress}
                                locale={safeLocale}
                                labels={dictionary.achievements}
                                highlightCodes={highlightCodes}
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
                                        mixed: dictionary.quiz.mixed,
                                    }}
                                    modeLabels={{
                                        classic: dictionary.quiz.classicTitle,
                                        blitz: dictionary.timedMode.title,
                                        survival: dictionary.survivalMode.title,
                                        daily: dictionary.dailyChallenge.title,
                                        challenge: dictionary.friendChallenge.versusEyebrow,
                                    }}
                                    allLabel={dictionary.quiz.filterAll}
                                />
                            </div>
                        )}
                    </ProfileFoldSection>
                </div>

                {/* Client details: open state переживает revalidate/refresh */}
                <ProfileSettingsSection
                    title={dictionary.profile.sectionSettings}
                    defaultOpen={!isGuest && Boolean(signInErrorMessage)}
                >
                    {/*
                      Строки «название — значение», форма по нажатию: настройки
                      не растягивают страницу. Гостю — только имя и аватар.
                    */}
                    <div className="rounded-lg border border-border bg-surface shadow-sm">
                        <ProfileSettingsRow
                            title={dictionary.profile.changeUsernameTitle}
                            value={session.user.username}
                            testId="settings-username"
                        >
                            <ChangeUsernameForm
                                locale={safeLocale}
                                dictionary={dictionary}
                                currentUsername={session.user.username}
                            />
                        </ProfileSettingsRow>

                        <ProfileSettingsRow
                            title={dictionary.profile.changeAvatarTitle}
                            value={
                                <UserAvatar
                                    src={session.user.image}
                                    pattern={avatarPattern}
                                    size="sm"
                                    className="!h-6 !w-6"
                                />
                            }
                            testId="settings-avatar"
                        >
                            <ChangeAvatarForm
                                locale={safeLocale}
                                dictionary={dictionary}
                                currentImageUrl={session.user.image ?? null}
                                avatarPattern={avatarPattern}
                            />
                        </ProfileSettingsRow>

                        {isGuest ? null : (
                            <ProfileSettingsRow
                                title={dictionary.profile.changePasswordTitle}
                                value={
                                    signInMethods && !signInMethods.hasPassword
                                        ? dictionary.profile.signInMethodNotSet
                                        : dictionary.profile.passwordSet
                                }
                                testId="settings-password"
                            >
                                {signInMethods && !signInMethods.hasPassword ? (
                                    <SetPasswordForm
                                        locale={safeLocale}
                                        dictionary={dictionary}
                                        emailRequired={signInMethods.email === null}
                                    />
                                ) : (
                                    <ChangePasswordForm
                                        locale={safeLocale}
                                        dictionary={dictionary}
                                    />
                                )}
                            </ProfileSettingsRow>
                        )}

                        {signInMethods ? (
                            <ProfileSettingsRow
                                title={dictionary.profile.signInMethodsTitle}
                                value={describeSignInMethods(signInMethods, dictionary)}
                                // Ошибка привязки входа видна сразу, без поиска.
                                defaultOpen={Boolean(signInErrorMessage)}
                                testId="settings-signin"
                            >
                                <SignInMethodsList
                                    locale={safeLocale}
                                    dictionary={dictionary}
                                    methods={signInMethods}
                                    errorMessage={signInErrorMessage}
                                />
                            </ProfileSettingsRow>
                        ) : null}
                    </div>
                </ProfileSettingsSection>
            </div>

            {highlightCodes.length > 0 ? <StripUnlockedQuery /> : null}
        </main>
    );
}
