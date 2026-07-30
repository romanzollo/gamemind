import { AchievementMark } from '@/features/achievements/components/AchievementMark';
import type { AchievementProgress } from '@/features/achievements/types';
import type { Dictionary } from '@/shared/i18n';
import { InlineAlert } from '@/shared/ui';

/**
 * Achievements на профиле: tile-сетка + illustration pack.
 *
 * sm+: 2 колонки — бейджи читаются как коллекция, не как длинный список строк.
 * Description скрыт на очень узких/в tile (остаётся title + status); полный текст в title attr.
 */

type ProfileAchievementsListProps = {
    /** null = Neon/read failed после catch-up. */
    progress: AchievementProgress | null;
    locale: string;
    labels: Dictionary['achievements'];
};

export function ProfileAchievementsList({
    progress,
    locale,
    labels,
}: ProfileAchievementsListProps) {
    if (progress === null) {
        return (
            <InlineAlert className="mt-3" tone="warning" role="status">
                {labels.loadFailed}
            </InlineAlert>
        );
    }

    return (
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {progress.items.map((item) => {
                const copy = labels.items[item.code];
                const unlockedAt = item.unlockedAt;
                const unlocked = unlockedAt !== null;
                const unlockedText = unlocked
                    ? unlockedAt.toLocaleDateString(locale, {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                      })
                    : null;
                const statusText = unlocked
                    ? labels.unlockedOn.replace('{date}', unlockedText ?? '')
                    : labels.locked;

                return (
                    <li
                        key={item.code}
                        title={copy.description}
                        className={
                            unlocked
                                ? 'flex gap-2.5 border border-border border-l-4 border-l-primary bg-surface p-2.5 sm:p-3'
                                : 'flex gap-2.5 border border-border border-l-4 border-l-border bg-surface/70 p-2.5 opacity-80 sm:p-3'
                        }
                    >
                        <AchievementMark
                            code={item.code}
                            unlocked={unlocked}
                            size="md"
                        />

                        <div className="min-w-0 flex-1 self-center">
                            <p className="font-display text-sm font-semibold leading-tight tracking-tight text-foreground">
                                {copy.title}
                            </p>
                            <p className="mt-1 font-mono text-[10px] leading-tight tabular-nums tracking-tight text-muted sm:text-[11px]">
                                {unlocked && unlockedAt ? (
                                    <time
                                        dateTime={unlockedAt.toISOString()}
                                    >
                                        {statusText}
                                    </time>
                                ) : (
                                    statusText
                                )}
                            </p>
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}
