/**
 * Client island: показывает toast за новые unlock’ы с result URL, затем
 * убирает `?unlocked=` (без шаринга query и без повтора на refresh).
 *
 * Коды приходят уже отфильтрованными с сервера (`parseUnlockedQuery`).
 * Не пишет в БД — только UI. Catch-up на profile сюда не попадает.
 *
 * Module-level guard: React Strict Mode в dev может дважды смонтировать
 * effect — без Set один flash дал бы два тоста.
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
            router.replace(resultPath);
            return;
        }
        firedFlashKeys.add(flashKey);

        showAchievementUnlockToasts(codes);
        router.replace(resultPath);
    }, [codes, resultPath, router]);

    return null;
}
