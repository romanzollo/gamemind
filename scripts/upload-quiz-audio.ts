/**
 * Загрузка собранных клипов AUDIO_GUESS в прод-хранилище (Vercel Blob).
 *
 * Берёт клипы партии из `content/quiz-audio.manifest.json` (их собрал
 * `scripts/build-quiz-audio.ts` в `public/media/audio/`) и кладёт в Blob
 * под ключом `audio/{hash}.mp3`. Браузер получает их с нашего домена:
 * `https://www.game-mind.ru/media/audio/{hash}.mp3` (rewrite `/media` →
 * Blob, проверен из РФ без VPN). После загрузки скрипт сам проверяет, что
 * www отдаёт 200 `audio/mpeg`; только после этого можно импортировать
 * партию на прод (`content:import-audio-guess -- --target=prod`).
 *
 * Ключ = хеш содержимого → один и тот же файл не грузится дважды, кеш
 * вечный (`cacheControlMaxAge` год). Снятие по запросу правообладателя —
 * снять вопрос с публикации и удалить объект (CDN ~60 с).
 *
 * Токен: `PROD_BLOB_READ_WRITE_TOKEN` в локальном `.env` (Vercel → Storage →
 * Blob). Запускает только владелец или по его команде — это запись на прод.
 *
 * Usage:
 *   npm run audio:upload -- --file=content/drafts/batches/<batch>.json [--dry-run]
 *
 * ADR: docs/DECISIONS.md → Audio questions: AUDIO_GUESS.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import { head, put } from '@vercel/blob';

const ROOT = resolve(__dirname, '..');
const MANIFEST_PATH = join(ROOT, 'content', 'quiz-audio.manifest.json');
const PROD_ORIGIN = 'https://www.game-mind.ru';
const AUDIO_URL_PATTERN = /^\/media\/audio\/([0-9a-f]{16})\.mp3$/;
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

type ManifestClip = { url: string; sha256: string; bytes: number };

function log(message: string): void {
    process.stdout.write(`${message}\n`);
}

/** Минимальный разбор `.env` (KEY="value"), без зависимостей. */
function readEnvValue(name: string): string | null {
    if (process.env[name]) return process.env[name] ?? null;
    for (const file of ['.env', '.env.local']) {
        const path = join(ROOT, file);
        if (!existsSync(path)) continue;
        const match = readFileSync(path, 'utf8').match(
            new RegExp(`^${name}\\s*=\\s*"?([^"\\r\\n]+)"?`, 'm'),
        );
        if (match) return match[1].trim();
    }
    return null;
}

async function main(): Promise<void> {
    const argv = process.argv.slice(2);
    const file = argv.find((arg) => arg.startsWith('--file='))?.slice('--file='.length);
    if (!file) {
        throw new Error('Usage: npm run audio:upload -- --file=<batch.json> [--dry-run]');
    }
    const dryRun = argv.includes('--dry-run');

    const batch = JSON.parse(
        readFileSync(isAbsolute(file) ? file : join(ROOT, file), 'utf8'),
    ) as { kind: string; questions: Array<{ audioStem: string }> };
    if (batch.kind !== 'AUDIO_GUESS_BATCH') {
        throw new Error('Expected kind AUDIO_GUESS_BATCH');
    }

    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
        clips: Record<string, ManifestClip>;
    };

    const token = readEnvValue('PROD_BLOB_READ_WRITE_TOKEN');
    if (!token && !dryRun) {
        throw new Error('PROD_BLOB_READ_WRITE_TOKEN is missing in .env (Vercel → Storage → Blob)');
    }

    let uploaded = 0;
    let present = 0;
    for (const { audioStem } of batch.questions) {
        const clip = manifest.clips[audioStem];
        const match = clip?.url.match(AUDIO_URL_PATTERN);
        if (!clip || !match) {
            throw new Error(`${audioStem}: not built. Run: npm run audio:build`);
        }
        const localPath = join(ROOT, 'public', clip.url.replace(/^\//, ''));
        const bytes = readFileSync(localPath);
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        if (sha256 !== clip.sha256 || !sha256.startsWith(match[1])) {
            throw new Error(`${audioStem}: local file does not match the manifest hash`);
        }

        const key = `audio/${match[1]}.mp3`;
        if (dryRun) {
            log(`would upload ${audioStem} → ${key} (${(bytes.length / 1024).toFixed(0)} KB)`);
            continue;
        }

        const exists = await head(key, { token: token ?? undefined }).then(
            () => true,
            () => false,
        );
        if (exists) {
            present += 1;
            log(`present ${audioStem} → ${key}`);
        } else {
            // Свежий ArrayBuffer: тот же приём, что в адаптере vercel-blob.
            const body = new Blob([new Uint8Array(bytes)], { type: 'audio/mpeg' });
            await put(key, body, {
                access: 'public',
                addRandomSuffix: false,
                contentType: 'audio/mpeg',
                cacheControlMaxAge: ONE_YEAR_SECONDS,
                token: token ?? undefined,
            });
            uploaded += 1;
            log(`upload  ${audioStem} → ${key}`);
        }

        const response = await fetch(`${PROD_ORIGIN}${clip.url}`, { method: 'HEAD' });
        const type = response.headers.get('content-type') ?? '';
        if (!response.ok || !type.startsWith('audio/mpeg')) {
            throw new Error(`${clip.url}: www answered ${response.status} ${type}`);
        }
    }

    log(
        dryRun
            ? 'Dry-run: nothing uploaded.'
            : `Done. uploaded=${uploaded} present=${present}; every clip answers 200 audio/mpeg on www.`,
    );
}

main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
});
