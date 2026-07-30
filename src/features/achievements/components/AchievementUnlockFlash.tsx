/**
 * Client island: показывает toast за новые unlock’ы с result URL, затем
 * убирает `?unlocked=` (без шаринга query и без повтора на refresh).
 *
 * Коды приходят уже отфильтрованными с сервера (`parseUnlockedQuery`).
 * Не пишет в БД — только UI. Catch-up на profile сюда не попадает.
 *
 * Module-level guard: React Strict Mode в dev может дважды смонтировать
 * effect — без Set один flash дал бы два тоста.
 *
 * Strip query с короткой задержкой — иначе soft replace на mobile может
 * помешать первому paint toast.
 */
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { showAchievementUnlockToasts } from '@/features/achievements/components/AchievementUnlockToast';
import type { AchievementCode } from '@/features/achievements/types';

type AchievementUnlockFlashProps = {
    codes: AchievementCode[];
    /** Чистый путь result без query — сюда replace после показа. */
    resultPath: string;
};

const firedFlashKeys = new Set<string>();

const STRIP_DELAY_MS = 120;

export function AchievementUnlockFlash({
    codes,
    resultPath,
}: AchievementUnlockFlashProps) {
    const router = useRouter();

    useEffect(() => {
        if (codes.length === 0) {
            return;
        }

        const flashKey = `${resultPath}:${codes.join(',')}`;
        if (firedFlashKeys.has(flashKey)) {
            router.replace(resultPath, { scroll: false });
            return;
        }
        firedFlashKeys.add(flashKey);

        showAchievementUnlockToasts(codes);

        const timer = window.setTimeout(() => {
            router.replace(resultPath, { scroll: false });
        }, STRIP_DELAY_MS);

        return () => {
            window.clearTimeout(timer);
        };
    }, [codes, resultPath, router]);

    return null;
}
