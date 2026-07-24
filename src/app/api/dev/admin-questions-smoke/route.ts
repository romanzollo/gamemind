/**
 * Dev-only smoke: findAllForAdmin path without auth cookie.
 * GET /api/dev/admin-questions-smoke
 * GET /api/dev/admin-questions-smoke?difficulty=EASY
 */
import { NextResponse } from 'next/server';

import { questionRepository } from '@/entities/question/question.repository';
import type { AdminQuestionListFilters } from '@/features/admin/lib/parse-admin-question-list-filters';
import type { Difficulty } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const url = new URL(request.url);
    const difficultyParam = url.searchParams.get('difficulty');
    const filters: AdminQuestionListFilters | undefined =
        difficultyParam === 'EASY' ||
        difficultyParam === 'MEDIUM' ||
        difficultyParam === 'HARD'
            ? {
                  status: 'all',
                  difficulty: difficultyParam as Difficulty,
                  type: 'all',
                  q: '',
              }
            : undefined;

    const startedAt = Date.now();

    try {
        const rows = await questionRepository.findAllForAdmin('ru', filters);

        return NextResponse.json({
            ok: true,
            ms: Date.now() - startedAt,
            rows: rows.length,
            filtersActive: Boolean(filters),
            sample: rows.slice(0, 2).map((row) => ({
                type: row.type,
                text: row.text.slice(0, 40),
                options: row._count.options,
                hasImage: Boolean(row.promptImageUrl),
            })),
        });
    } catch (error) {
        return NextResponse.json(
            {
                ok: false,
                ms: Date.now() - startedAt,
                error: error instanceof Error ? error.message : String(error),
            },
            { status: 500 },
        );
    }
}
