'use client';

/**
 * Клиентская подгрузка разбора: score уже на экране.
 *
 * Option B: API читает slim reviewPayload (быстро). Legacy TOAST — короткий
 * backoff. Abort при unmount (уход на главную не клинит очередь).
 */

import { useEffect, useRef, useState } from 'react';

import { QuizResultReview } from '@/features/quiz/components/QuizResultReview';
import type { QuizResultReviewItem } from '@/features/quiz/types';
import type { Dictionary, Locale } from '@/shared/i18n';
import { InlineAlert } from '@/shared/ui';

type QuizResultReviewClientLoaderProps = {
    sessionId: string;
    locale: Locale;
    labels: Dictionary['quiz'];
    loadingLabel: string;
    retryLabel: string;
};

/** Паузы перед попытками: payload path быстрый; pending/legacy — чуть длиннее гонки attach. */
const ATTEMPT_DELAYS_MS = [200, 800, 1_500, 3_000] as const;

export function QuizResultReviewClientLoader({
    sessionId,
    locale,
    labels,
    loadingLabel,
    retryLabel,
}: QuizResultReviewClientLoaderProps) {
    const [items, setItems] = useState<QuizResultReviewItem[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [loading, setLoading] = useState(true);
    const [retryToken, setRetryToken] = useState(0);
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        abortRef.current = controller;
        let cancelled = false;

        async function loadWithRetries() {
            setLoading(true);
            setFailed(false);
            setItems(null);

            for (let attempt = 0; attempt < ATTEMPT_DELAYS_MS.length; attempt++) {
                await new Promise<void>((resolve) => {
                    const timer = setTimeout(resolve, ATTEMPT_DELAYS_MS[attempt]);
                    controller.signal.addEventListener(
                        'abort',
                        () => {
                            clearTimeout(timer);
                            resolve();
                        },
                        { once: true },
                    );
                });

                if (cancelled || controller.signal.aborted) {
                    return;
                }

                try {
                    const response = await fetch(
                        `/api/result/${sessionId}/review?locale=${locale}`,
                        {
                            method: 'GET',
                            credentials: 'same-origin',
                            signal: controller.signal,
                            cache: 'no-store',
                        },
                    );

                    if (response.ok) {
                        const data = (await response.json()) as {
                            items?: QuizResultReviewItem[];
                        };

                        if (!cancelled && Array.isArray(data.items)) {
                            setItems(data.items);
                            setLoading(false);
                            setFailed(false);
                            return;
                        }
                    }

                    // 503/timeout → следующая попытка; 404/401 → сразу fail.
                    if (response.status === 401 || response.status === 404) {
                        break;
                    }
                } catch (error) {
                    if (
                        cancelled ||
                        controller.signal.aborted ||
                        (error instanceof DOMException &&
                            error.name === 'AbortError')
                    ) {
                        return;
                    }
                }
            }

            if (!cancelled && !controller.signal.aborted) {
                setFailed(true);
                setLoading(false);
            }
        }

        void loadWithRetries();

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [sessionId, locale, retryToken]);

    if (items !== null) {
        return <QuizResultReview items={items} labels={labels} />;
    }

    if (loading) {
        return (
            <p className="mt-4 text-sm text-muted" role="status">
                {loadingLabel}
            </p>
        );
    }

    if (failed) {
        return (
            <div className="mt-4 space-y-3">
                <InlineAlert tone="warning" role="status">
                    {labels.errors.reviewLoadFailed}
                </InlineAlert>
                <button
                    type="button"
                    className="text-sm font-medium text-accent underline-offset-2 hover:underline"
                    onClick={() => setRetryToken((value) => value + 1)}
                >
                    {retryLabel}
                </button>
            </div>
        );
    }

    return null;
}
