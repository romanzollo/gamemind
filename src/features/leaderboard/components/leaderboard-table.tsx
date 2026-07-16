import type { Dictionary } from '@/shared/i18n';
import type { LeaderboardEntry } from '../types/leaderboard-entry';

// пропсы для таблицы лидеров
type LeaderboardTableProps = {
    entries: LeaderboardEntry[];
    labels: Dictionary['leaderboard'];
};

// таблица лидеров
export function LeaderboardTable({ entries, labels }: LeaderboardTableProps) {
    // если нет результатов, возвращаем пустой текст
    if (entries.length === 0) {
        return (
            <p className="mt-6 text-neutral-600 dark:text-neutral-400">
                {labels.empty}
            </p>
        );
    }

    // возвращаем таблицу лидеров
    return (
        <div className="mt-6 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
                <thead>
                    <tr className="border-b border-border text-neutral-500 dark:text-neutral-400">
                        <th className="py-2 pr-4">{labels.rank}</th>
                        <th className="py-2 pr-4">{labels.player}</th>
                        <th className="py-2 pr-4">{labels.score}</th>
                        <th className="py-2">{labels.correct}</th>
                    </tr>
                </thead>
                <tbody>
                    {entries.map((entry) => (
                        // строка таблицы лидеров
                        <tr
                            key={entry.userId}
                            className="border-b border-border"
                        >
                            <td className="py-3 pr-4 font-medium">
                                {entry.rank}
                            </td>
                            <td className="py-3 pr-4">{entry.username}</td>
                            <td className="py-3 pr-4 tabular-nums">
                                {entry.score}
                            </td>
                            <td className="py-3 tabular-nums">
                                {entry.correctCount} / {entry.totalQuestions}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
