/**
 * Раздел «Комнаты» в профиле (макет v3, экран 6): свои цифры (игры,
 * победы, подиумы, % побед), коллекция наград — все виды, недобытые серые
 * («хочется собрать все»), и главные соперники со счётом встреч.
 *
 * Server Component: одна pooled-выборка из RoomResult, в Suspense — профиль
 * рисуется без него, сбой базы просто прячет раздел. Не сыграл ни одной
 * комнаты — раздела нет.
 * Canon: docs/DECISIONS.md → Quiz room (v3, рейтинг комнат).
 */

import { ProfileFoldSection } from '@/features/profile/components/ProfileFoldSection';
import { RoomAwardIcon } from '@/features/quiz-room/components/room-award-view';
import { ROOM_AWARD_KINDS } from '@/features/quiz-room/lib/room-awards';
import { readRoomProfileStats } from '@/features/quiz-room/server/room-service';
import type { RoomProfileStatsDto } from '@/features/quiz-room/types';
import type { Dictionary } from '@/shared/i18n';

type ProfileRoomsSectionProps = {
    userId: string;
    dictionary: Dictionary;
};

const EYEBROW = 'font-mono text-2xs font-medium uppercase tracking-[0.14em] text-muted';

export async function ProfileRoomsSection({ userId, dictionary }: ProfileRoomsSectionProps) {
    let stats: RoomProfileStatsDto;

    try {
        stats = await readRoomProfileStats(userId);
    } catch (error) {
        console.warn('Profile rooms stats failed:', error instanceof Error ? error.message : error);
        return null;
    }

    if (stats.games === 0) {
        return null;
    }

    const text = dictionary.room;
    const winRate = Math.round((stats.wins / stats.games) * 100);
    const numbers = [
        { value: String(stats.games), label: text.profileRoomsGames },
        { value: String(stats.wins), label: text.profileRoomsWins },
        { value: String(stats.podiums), label: text.profileRoomsPodiums },
        { value: `${winRate}%`, label: text.profileRoomsWinRate },
    ];

    return (
        <ProfileFoldSection
            title={text.profileRoomsTitle}
            titleId="profile-rooms-title"
            trailing={String(stats.games)}
        >
            <div className="flex flex-col gap-4 pb-4 lg:pt-3" data-testid="profile-rooms">
                <dl className="grid grid-cols-4 gap-2 rounded-lg border border-border bg-surface p-3 text-center shadow-sm">
                    {numbers.map((item) => (
                        <div key={item.label}>
                            <dt className="sr-only">{item.label}</dt>
                            <dd className="font-display text-2xl font-semibold text-foreground tabular-nums">
                                {item.value}
                            </dd>
                            <dd aria-hidden className="text-2xs text-muted">
                                {item.label}
                            </dd>
                        </div>
                    ))}
                </dl>

                <section>
                    <h3 className={`${EYEBROW} mb-2`}>{text.profileRoomsAwards}</h3>
                    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {ROOM_AWARD_KINDS.map((kind) => {
                            const count = stats.awards[kind] ?? 0;

                            return (
                                <li
                                    key={kind}
                                    className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${
                                        count > 0 ? 'border-border bg-surface' : 'border-dashed border-border bg-transparent'
                                    }`}
                                >
                                    <RoomAwardIcon kind={kind} muted={count === 0} />
                                    <span className={`min-w-0 flex-1 text-xs leading-tight hyphens-auto line-clamp-2 ${count > 0 ? 'font-medium text-foreground' : 'text-muted'}`}>
                                        {text.awards[kind].title}
                                    </span>
                                    <span className="font-mono text-2xs text-muted tabular-nums">×{count}</span>
                                </li>
                            );
                        })}
                    </ul>
                </section>

                {stats.rivals.length > 0 ? (
                    <section>
                        <h3 className={`${EYEBROW} mb-1`}>{text.profileRoomsRivals}</h3>
                        <ul className="flex flex-col">
                            {stats.rivals.map((rival) => {
                                const tone =
                                    rival.myWins > rival.theirWins
                                        ? 'text-success'
                                        : rival.myWins < rival.theirWins
                                          ? 'text-danger'
                                          : 'text-foreground';

                                return (
                                    <li
                                        key={`${rival.nickname}-${rival.games}`}
                                        className="flex min-h-11 items-center justify-between gap-3 border-b border-border text-sm last:border-b-0"
                                    >
                                        <span className="truncate text-foreground">{rival.nickname}</span>
                                        <span className={`font-display text-xl font-bold tabular-nums ${tone}`}>
                                            {rival.myWins} : {rival.theirWins}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                ) : null}
            </div>
        </ProfileFoldSection>
    );
}
