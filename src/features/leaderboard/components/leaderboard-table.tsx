import type { Dictionary } from '@/shared/i18n';
import { EmptyState } from '@/shared/ui';
import type { LeaderboardEntry } from '../types/leaderboard-entry';

type LeaderboardTableProps = {
    entries: LeaderboardEntry[];
    labels: Dictionary['leaderboard'];
};

export function LeaderboardTable({ entries, labels }: LeaderboardTableProps) {
    if (entries.length === 0) {
        return <EmptyState className="mt-6" title={labels.empty} />;
    }

    return (
        <div className="mt-6 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
                <thead>
                    <tr className="border-b border-border text-muted">
                        <th className="py-2 pr-4 font-medium">{labels.rank}</th>
                        <th className="py-2 pr-4 font-medium">{labels.player}</th>
                        <th className="py-2 pr-4 font-medium">{labels.score}</th>
                        <th className="py-2 font-medium">{labels.correct}</th>
                    </tr>
                </thead>
                <tbody>
                    {entries.map((entry) => (
                        <tr
                            key={entry.userId}
                            className="border-b border-border"
                        >
                            <td className="py-3 pr-4 font-medium tabular-nums text-foreground">
                                {entry.rank}
                            </td>
                            <td className="py-3 pr-4 text-foreground">
                                {entry.username}
                            </td>
                            <td className="py-3 pr-4 tabular-nums text-foreground">
                                {entry.score}
                            </td>
                            <td className="py-3 tabular-nums text-foreground">
                                {entry.correctCount}/{entry.totalQuestions}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
