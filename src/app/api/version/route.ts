/**
 * Какой коммит сейчас отвечает на этом домене.
 *
 * Зачем: прод-smoke (`.github/workflows/prod-smoke.yml`) стартует по событию
 * «деплой готов», но домен может ещё какое-то время отдавать прошлую сборку.
 * Workflow ждёт здесь sha своего деплоя и только потом играет — иначе smoke
 * проверил бы старый код.
 *
 * Без БД и auth: не будит Neon и не трогает горячий путь квиза. Sha не
 * секрет — репозиторий публичный. Локально `commit: null`.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET() {
    return NextResponse.json(
        { commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null },
        { headers: { 'Cache-Control': 'no-store' } },
    );
}
