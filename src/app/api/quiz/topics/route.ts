/**
 * Темы игры и их доступность по сложностям — для чипов «Тема» в шторках
 * Классики и Блица и подписи «Продолжить».
 *
 * Публичные данные без игрока: ответ кэширует CDN Vercel (10 мин, затем
 * stale-while-revalidate), поэтому база читается редко, а рендер главной
 * не получает нового запроса к Neon. Ошибка — 503 без кэша: шторка просто
 * не покажет ряд тем, игра работает как без них.
 *
 * Canon: docs/DECISIONS.md → Play topics.
 */

import { NextResponse } from 'next/server';

import { playTopicRepository } from '@/entities/play-topic/play-topic.repository';
import { captureAppError } from '@/lib/monitoring/capture-app-error';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const topics = await playTopicRepository.findPlayTopicOptions();

        return NextResponse.json(
            { topics },
            {
                headers: {
                    'Cache-Control':
                        'public, s-maxage=600, stale-while-revalidate=3600',
                },
            },
        );
    } catch (error) {
        // Обход есть (игра без темы) — warning, не error.
        captureAppError(error, {
            area: 'quiz-start',
            level: 'warning',
            extra: { operation: 'topics' },
        });

        return NextResponse.json(
            { topics: null },
            { status: 503, headers: { 'Cache-Control': 'no-store' } },
        );
    }
}
