'use client';

/**
 * «Поделиться результатом»: текст в духе Wordle + кнопки ShareActions
 * (системное меню / буфер, Telegram, VK, MAX).
 * Квадратики и серия приходят из result-share-store (те же данные, что
 * разбор и блок серии), ссылки пересобираются, когда они появились.
 * Canon: docs/DECISIONS.md → Share result.
 */

import { useEffect, useMemo } from 'react';

import {
    buildResultShare,
    buildShareSquares,
    buildShareTargets,
    type ResultShareInput,
} from '@/features/quiz/lib/build-result-share';
import {
    publishDailyStreakDays,
    useDailyStreakDaysForShare,
    useResultReviewForShare,
} from '@/features/quiz/lib/result-share-store';
import { ShareActions } from '@/features/quiz/components/ShareActions';
import type { Dictionary, Locale } from '@/shared/i18n';

type ShareResultProps = {
    locale: Locale;
    sessionId: string;
    url: string;
    labels: Dictionary['share'];
    streakDaysForms: Dictionary['dailyChallenge']['streakDays'];
    /** Заголовок уже собран сервером (режим, сложность / дата Челленджа). */
    title: string;
    result:
        | {
              kind: 'quiz';
              correct: number;
              total: number;
              score: number;
              isDaily: boolean;
          }
        | { kind: 'survival'; runScore: number; waveIndex: number };
};

export function ShareResult({
    locale,
    sessionId,
    url,
    labels,
    streakDaysForms,
    title,
    result,
}: ShareResultProps) {
    const reviewItems = useResultReviewForShare(sessionId);
    const streakDays = useDailyStreakDaysForShare();

    const share = useMemo(() => {
        const input: ResultShareInput =
            result.kind === 'survival'
                ? { kind: 'survival', title, runScore: result.runScore, waveIndex: result.waveIndex }
                : {
                      kind: 'quiz',
                      title,
                      correct: result.correct,
                      total: result.total,
                      score: result.score,
                      squares: reviewItems ? buildShareSquares(reviewItems, result.total) : null,
                      streakDays: result.isDaily ? streakDays : null,
                  };

        return buildResultShare(
            input,
            {
                scoreLine: labels.scoreLine,
                points: labels.points,
                survivalLine: labels.survivalLine,
                streakLine: labels.streakLine,
                streakDays: streakDaysForms,
                invite: labels.invite,
            },
            locale,
            url,
        );
    }, [labels, locale, result, reviewItems, streakDays, streakDaysForms, title, url]);

    return (
        <ShareActions
            shareWhat="result"
            text={share.text}
            targets={buildShareTargets(share)}
            labels={labels}
            className="mt-4 border-t border-border pt-4 sm:mt-5"
        />
    );
}

/** Блок серии на результате Челленджа отдаёт длину серии в текст шаринга. */
export function PublishDailyStreakForShare({ days }: { days: number }) {
    useEffect(() => {
        publishDailyStreakDays(days);
    }, [days]);

    return null;
}
