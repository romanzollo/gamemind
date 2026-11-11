/**
 * Все, кто принял вызов: место, игрок, очки. Видят автор и сыгравшие.
 * Порядок задаёт запрос (очки → верные → кто раньше). Строка зрителя
 * подписана «Ты». Server-safe.
 */

import type { ChallengeTaker } from '@/entities/friend-challenge/friend-challenge.repository';
import { UserAvatar } from '@/shared/ui';
import { getAvatarPattern } from '@/shared/ui/avatar-pattern';

export function ChallengeTakers({
    takers,
    viewerId,
    maxScore,
    title,
    emptyText,
    youLabel,
}: {
    takers: ChallengeTaker[];
    viewerId: string | null;
    maxScore: number | null;
    title: string;
    emptyText: string;
    youLabel: string;
}) {
    return (
        <section className="mt-6" data-testid="friend-challenge-takers">
            <h2 className="font-display text-xl font-bold text-foreground">{title}</h2>

            {takers.length === 0 ? (
                <p className="mt-2 text-sm text-muted">{emptyText}</p>
            ) : (
                <ol className="mt-3 divide-y divide-border rounded-lg border border-border bg-surface">
                    {takers.map((taker, index) => {
                        const isViewer = taker.userId === viewerId;

                        return (
                            <li
                                key={taker.userId}
                                className={`flex items-center gap-3 px-4 py-3 ${
                                    isViewer ? 'bg-primary/5' : ''
                                }`}
                            >
                                <span className="w-6 font-mono text-sm tabular-nums text-muted">
                                    {index + 1}
                                </span>
                                <UserAvatar
                                    src={taker.image}
                                    pattern={getAvatarPattern(taker.userId)}
                                    size="sm"
                                />
                                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                                    {taker.username}
                                    {isViewer ? (
                                        <span className="ml-2 text-muted">· {youLabel}</span>
                                    ) : null}
                                </span>
                                <span className="font-display text-xl font-bold tabular-nums text-foreground">
                                    {maxScore == null
                                        ? taker.score
                                        : `${taker.score} / ${maxScore}`}
                                </span>
                            </li>
                        );
                    })}
                </ol>
            )}
        </section>
    );
}
