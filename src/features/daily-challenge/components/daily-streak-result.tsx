/**
 * Серия дней на странице результата Челленджа (Server Component).
 *
 * Отдельный pooled-запрос дат в своём Suspense: результат не ждёт серию,
 * сбой чтения — блок просто не показывается (summary уже на экране).
 * Новый рекорд и таймер до следующего челленджа — здесь, после игры.
 */

import { dailyChallengeRepository } from '@/entities/daily-challenge/daily-challenge.repository';
import { DailyStreakSummary } from '@/features/daily-challenge/components/daily-streak';
import { computeDailyStreak } from '@/features/daily-challenge/lib/compute-daily-streak';
import { getMoscowDateKey } from '@/features/daily-challenge/lib/get-moscow-date-key';
import type { Dictionary, Locale } from '@/shared/i18n';

type DailyStreakResultProps = {
    userId: string;
    locale: Locale;
    labels: Dictionary['dailyChallenge'];
};

export async function DailyStreakResult({
    userId,
    locale,
    labels,
}: DailyStreakResultProps) {
    let playedDateKeys: string[];

    try {
        playedDateKeys =
            await dailyChallengeRepository.findPlayedDateKeys(userId);
    } catch (error) {
        console.warn('Daily streak load skipped:', error);
        return null;
    }

    const streak = computeDailyStreak(playedDateKeys, getMoscowDateKey());

    return (
        <DailyStreakSummary
            className="mt-4"
            streak={streak}
            locale={locale}
            labels={labels}
            showNewBest
            showCountdown={streak.playedToday}
        />
    );
}
