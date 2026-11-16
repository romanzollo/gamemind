/**
 * Досчёт итогов уже сыгранных комнат в RoomResult (после миграции
 * 20261116120000_room_result). Для каждой FINISHED-комнаты без итогов —
 * место, очки и награды теми же функциями, что и живая запись.
 * Повторный запуск безопасен (ON CONFLICT DO NOTHING).
 *
 * Usage:
 *   npx tsx scripts/backfill-room-results.ts --dry-run
 *   npx tsx scripts/backfill-room-results.ts
 *   npx tsx scripts/backfill-room-results.ts --target=prod --dry-run
 *   npx tsx scripts/backfill-room-results.ts --target=prod
 *
 * Прод — только с «да» владельца. Canon: docs/DECISIONS.md → Quiz room.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvFile(): void {
    const path = resolve(process.cwd(), '.env');
    if (!existsSync(path)) return;

    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
        if (!(key in process.env)) process.env[key] = value;
    }
}

/** Прод — в DATABASE_URL* до первого импорта репозитория (урок Aug 4). */
function applyTarget(prod: boolean): string {
    if (!prod) {
        return new URL(process.env.DATABASE_URL ?? '').hostname;
    }

    const pooled = process.env.PROD_DATABASE_URL;
    const unpooled = process.env.PROD_DATABASE_URL_UNPOOLED;

    if (!pooled || !unpooled) {
        throw new Error('PROD_DATABASE_URL and PROD_DATABASE_URL_UNPOOLED are required for --target=prod');
    }

    const host = new URL(unpooled).hostname;

    if (host.includes('jolly-river')) {
        throw new Error(`Refusing --target=prod: host looks like local Neon (${host})`);
    }

    process.env.DATABASE_URL = pooled;
    process.env.DATABASE_URL_UNPOOLED = unpooled;
    return host;
}

async function main() {
    loadEnvFile();
    const argv = process.argv.slice(2);
    const dryRun = argv.includes('--dry-run');
    const host = applyTarget(argv.includes('--target=prod'));

    console.log(`Target: ${host}${dryRun ? ' (dry run)' : ''}`);

    const { quizRoomRepository } = await import('@/entities/quiz-room/quiz-room.repository');
    const missing = await quizRoomRepository.listRoomsMissingResults(1000);

    console.log(`Finished rooms without results: ${missing.length}`);

    if (dryRun || missing.length === 0) {
        return;
    }

    const { backfillRoomResults } = await import('@/features/quiz-room/server/room-service');
    const done = await backfillRoomResults(1000);

    console.log(`Backfilled rooms: ${done.rooms}, result rows: ${done.rows}`);
}

main().then(
    () => process.exit(0),
    (error: unknown) => {
        console.error(error);
        process.exit(1);
    },
);
