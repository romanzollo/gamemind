'use client';

/**
 * «Поделиться результатом»: кнопка + прямые ссылки в Telegram, VK и MAX.
 *
 * Кнопка: на телефоне (pointer: coarse) — системное меню Web Share API
 * (там и MAX, и любые установленные мессенджеры); на компьютере — текст в
 * буфер и тост. Ссылки мессенджеров нужны прежде всего на компьютере, где
 * системного меню нет или оно неудобное.
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
import type { Dictionary, Locale } from '@/shared/i18n';
import { buttonClassName } from '@/shared/ui/button';
import { toastError, toastSuccess } from '@/shared/ui/toast';

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

function ShareMark() {
    return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden className="shrink-0">
            <path
                d="M8 10V2.5M5 5.5l3-3 3 3M3.5 9v4h9V9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

const TARGET_LINKS = [
    { key: 'telegram', label: 'Telegram' },
    { key: 'vk', label: 'VK' },
    { key: 'max', label: 'MAX' },
] as const;

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

    const targets = buildShareTargets(share);

    async function handleShare() {
        const prefersSystemSheet =
            window.matchMedia('(pointer: coarse)').matches &&
            typeof navigator.share === 'function';

        if (prefersSystemSheet) {
            try {
                await navigator.share({ text: share.text });
                return;
            } catch (error) {
                // Игрок закрыл меню — это не ошибка.
                if (error instanceof DOMException && error.name === 'AbortError') {
                    return;
                }
            }
        }

        try {
            await navigator.clipboard.writeText(share.text);
            toastSuccess(labels.copied);
        } catch {
            toastError(labels.copyFailed);
        }
    }

    return (
        <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4 sm:mt-5 sm:flex-row sm:items-center sm:gap-3">
            <button
                type="button"
                onClick={handleShare}
                className={buttonClassName({
                    variant: 'secondary',
                    className: 'w-full gap-2 sm:w-auto',
                })}
            >
                <ShareMark />
                {labels.button}
            </button>
            <div
                role="group"
                aria-label={labels.button}
                className="grid grid-cols-3 gap-2 sm:flex"
            >
                {TARGET_LINKS.map((target) => (
                    <a
                        key={target.key}
                        href={targets[target.key]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-surface px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                        {target.label}
                    </a>
                ))}
            </div>
        </div>
    );
}

/** Блок серии на результате Челленджа отдаёт длину серии в текст шаринга. */
export function PublishDailyStreakForShare({ days }: { days: number }) {
    useEffect(() => {
        publishDailyStreakDays(days);
    }, [days]);

    return null;
}
