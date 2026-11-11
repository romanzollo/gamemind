/**
 * Конвейер клипов AUDIO_GUESS: исходник → готовый клип для квиза.
 *
 * Для каждого вопроса партии (`kind: AUDIO_GUESS_BATCH`):
 * 1) ffmpeg вырезает `audio.startSeconds` + `audio.durationSeconds` из
 *    `audio.sourceFile` (только из `raw-quiz-audio/`);
 * 2) громкость −18 LUFS / true peak −1.5 dBTP (loudnorm в два прохода),
 *    плавное начало 0.4 с и конец 0.5 с;
 * 3) MP3 CBR 128 кбит/с, 44.1 кГц, стерео, без тегов и кадра Xing/LAME;
 * 4) `sanitizeQuizMp3` (src/lib/storage/mp3.ts) — в файле только аудиокадры,
 *    длина 4–11 с, ≤ 300 КБ; `ffprobe` подтверждает, что тегов нет;
 * 5) имя = первые 16 hex SHA-256 байтов → `public/media/audio/{hash}.mp3`
 *    (dev, local-public) + запись в `content/quiz-audio.manifest.json`.
 * `--review` — HTML-страница с плеерами в `raw-quiz-audio/_review/`
 * (ответ подсвечен, таймкоды, источник): владелец проверяет на слух.
 *
 * Прод: файлы грузит `scripts/upload-quiz-audio.ts` (Vercel Blob), не этот
 * скрипт. Клипы не коммитим — репозиторий публичный.
 *
 * Usage:
 *   npm run audio:build -- --file=content/drafts/batches/<batch>.json [--review] [--force] [--only=<stem>]
 *
 * ADR: docs/DECISIONS.md → Audio questions: AUDIO_GUESS.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    existsSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';

import { sanitizeQuizMp3 } from '../src/lib/storage/mp3';

const ROOT = resolve(__dirname, '..');
const RAW_DIR = join(ROOT, 'raw-quiz-audio');
const REVIEW_DIR = join(RAW_DIR, '_review');
const OUT_DIR = join(ROOT, 'public', 'media', 'audio');
const MANIFEST_PATH = join(ROOT, 'content', 'quiz-audio.manifest.json');

/** Целевая громкость клипа (ADR): одинаково от игры к игре и без «удара» после тишины квиза. */
const LOUDNESS = { integrated: -18, truePeak: -1.5, range: 11 } as const;
const FADE_IN_SECONDS = 0.4;
const FADE_OUT_SECONDS = 0.5;
/** Отклонение итоговой громкости, после которого печатаем предупреждение. */
const LOUDNESS_WARN_LU = 1.5;

type LocalizedText = { ru: { text: string }; en: { text: string } };

type AudioBatchQuestion = {
    draftKey: string;
    type: 'AUDIO_GUESS';
    difficulty: 'EASY' | 'MEDIUM' | 'HARD';
    audioStem: string;
    audio: {
        sourceFile: string;
        startSeconds: number;
        durationSeconds: number;
    };
    metadata?: {
        game?: string;
        track?: string;
        composer?: string;
        source?: string;
        [key: string]: unknown;
    };
    translations: LocalizedText;
    options: Array<{ isCorrect: boolean; translations: LocalizedText }>;
};

type AudioBatch = {
    kind: 'AUDIO_GUESS_BATCH';
    questions: AudioBatchQuestion[];
};

type ManifestClip = {
    url: string;
    sha256: string;
    bytes: number;
    durationMs: number;
    loudnessLufs: number | null;
    input: AudioBatchQuestion['audio'];
};

type AudioManifest = { version: 1; clips: Record<string, ManifestClip> };

function log(message: string): void {
    process.stdout.write(`${message}\n`);
}

function parseArgs(argv: string[]) {
    const value = (name: string) =>
        argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
    const file = value('file');
    if (!file) {
        throw new Error('Usage: npm run audio:build -- --file=<batch.json> [--review] [--force] [--only=<stem>]');
    }
    return {
        batchPath: isAbsolute(file) ? file : join(ROOT, file),
        only: value('only') ?? null,
        force: argv.includes('--force'),
        review: argv.includes('--review'),
    };
}

function runTool(tool: 'ffmpeg' | 'ffprobe', args: string[]): { stdout: string; stderr: string } {
    const result = spawnSync(tool, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    if (result.error) {
        throw new Error(`${tool} is not available: ${result.error.message}`);
    }
    if (result.status !== 0) {
        throw new Error(`${tool} failed (${result.status}): ${result.stderr.slice(-800)}`);
    }
    return { stdout: result.stdout, stderr: result.stderr };
}

/** Последний JSON-объект в выводе loudnorm. */
function parseLoudnormJson(stderr: string): Record<string, string> {
    const start = stderr.lastIndexOf('{');
    const end = stderr.lastIndexOf('}');
    if (start === -1 || end <= start) {
        throw new Error('loudnorm did not print measurements');
    }
    return JSON.parse(stderr.slice(start, end + 1)) as Record<string, string>;
}

function readManifest(): AudioManifest {
    if (!existsSync(MANIFEST_PATH)) {
        return { version: 1, clips: {} };
    }
    return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as AudioManifest;
}

function writeManifest(manifest: AudioManifest): void {
    const sorted = Object.fromEntries(
        Object.entries(manifest.clips).sort(([left], [right]) => left.localeCompare(right)),
    );
    writeFileSync(MANIFEST_PATH, `${JSON.stringify({ version: 1, clips: sorted }, null, 4)}\n`);
}

function sameInput(left: ManifestClip['input'], right: AudioBatchQuestion['audio']): boolean {
    return (
        left.sourceFile === right.sourceFile &&
        left.startSeconds === right.startSeconds &&
        left.durationSeconds === right.durationSeconds
    );
}

function validateQuestion(question: AudioBatchQuestion): string[] {
    const errors: string[] = [];
    const { audio } = question;
    if (question.type !== 'AUDIO_GUESS') errors.push('type must be AUDIO_GUESS');
    if (!/^[a-z0-9][a-z0-9-]*$/.test(question.audioStem ?? '')) {
        errors.push('audioStem must be lowercase latin, digits and dashes');
    }
    if (!audio || typeof audio.sourceFile !== 'string') {
        errors.push('audio.sourceFile is required');
        return errors;
    }
    const sourcePath = resolve(ROOT, audio.sourceFile);
    if (relative(RAW_DIR, sourcePath).startsWith('..')) {
        errors.push('audio.sourceFile must be inside raw-quiz-audio/');
    }
    if (!(audio.startSeconds >= 0)) errors.push('audio.startSeconds must be ≥ 0');
    if (!(audio.durationSeconds >= 5 && audio.durationSeconds <= 10)) {
        errors.push('audio.durationSeconds must be 5–10 (ADR: 10 by default, HARD may be 6–8)');
    }
    if (question.options?.filter((option) => option.isCorrect).length !== 1) {
        errors.push('exactly one correct option');
    }
    return errors;
}

/** ffmpeg: вырезка + громкость + fade + MP3 без тегов. Возвращает байты. */
function encodeClip(question: AudioBatchQuestion, workDir: string): Buffer {
    const { audio } = question;
    const sourcePath = resolve(ROOT, audio.sourceFile);
    // `-map 0:a:0` + `-vn`: у MP3 часто есть обложка (поток-картинка) — в клип
    // идёт только первая аудиодорожка, иначе ffmpeg пытается писать картинку.
    const cut = [
        '-ss', String(audio.startSeconds), '-t', String(audio.durationSeconds), '-i', sourcePath,
        '-map', '0:a:0', '-vn',
    ];
    const target = `I=${LOUDNESS.integrated}:TP=${LOUDNESS.truePeak}:LRA=${LOUDNESS.range}`;

    const firstPass = runTool('ffmpeg', [
        '-hide_banner', '-nostats', ...cut,
        '-af', `loudnorm=${target}:print_format=json`,
        '-f', 'null', '-',
    ]);
    const measured = parseLoudnormJson(firstPass.stderr);

    const fadeOutStart = Math.max(0, audio.durationSeconds - FADE_OUT_SECONDS);
    const filters = [
        `loudnorm=${target}` +
            `:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}` +
            `:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}` +
            `:offset=${measured.target_offset}:linear=true`,
        'aresample=44100',
        `afade=t=in:st=0:d=${FADE_IN_SECONDS}`,
        `afade=t=out:st=${fadeOutStart}:d=${FADE_OUT_SECONDS}`,
    ].join(',');

    const outPath = join(workDir, `${question.audioStem}.mp3`);
    runTool('ffmpeg', [
        '-hide_banner', '-nostats', '-y', ...cut,
        '-af', filters,
        '-ac', '2', '-ar', '44100',
        '-c:a', 'libmp3lame', '-b:a', '128k',
        '-map_metadata', '-1', '-map_chapters', '-1',
        '-id3v2_version', '0', '-write_id3v1', '0', '-write_xing', '0',
        '-fflags', '+bitexact', '-flags:a', '+bitexact',
        '-f', 'mp3', outPath,
    ]);
    return readFileSync(outPath);
}

/** ffprobe не должен видеть ни одного тега ни у файла, ни у потока. */
function assertNoTags(filePath: string): void {
    const { stdout } = runTool('ffprobe', [
        '-v', 'error', '-f', 'mp3', '-show_entries', 'format_tags:stream_tags', '-of', 'json', filePath,
    ]);
    const probe = JSON.parse(stdout) as {
        format?: { tags?: Record<string, string> };
        streams?: Array<{ tags?: Record<string, string> }>;
    };
    const tags = [
        ...Object.keys(probe.format?.tags ?? {}),
        ...(probe.streams ?? []).flatMap((stream) => Object.keys(stream.tags ?? {})),
    ];
    if (tags.length > 0) {
        throw new Error(`ffprobe found tags in ${basename(filePath)}: ${tags.join(', ')}`);
    }
}

/**
 * Итоговая громкость (EBU R128 integrated) готового клипа.
 * `-f mp3` явно: у клипа нет заголовков (теги и кадр Xing сняты), и по
 * первым байтам ffmpeg иногда угадывает чужой формат (был случай — VVC).
 */
function measureLoudness(filePath: string): number | null {
    const { stderr } = runTool('ffmpeg', [
        '-hide_banner', '-nostats', '-f', 'mp3', '-i', filePath, '-af', 'ebur128=framelog=quiet', '-f', 'null', '-',
    ]);
    const match = stderr.match(/I:\s+(-?\d+(?:\.\d+)?)\s+LUFS/g);
    if (!match) return null;
    const last = match[match.length - 1].match(/-?\d+(?:\.\d+)?/);
    return last ? Number(last[0]) : null;
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function writeReviewPage(batchPath: string, batch: AudioBatch, manifest: AudioManifest): string {
    mkdirSync(REVIEW_DIR, { recursive: true });
    const name = basename(batchPath, '.json');
    const pagePath = join(REVIEW_DIR, `${name}.html`);
    const rows = batch.questions.map((question, index) => {
        const clip = manifest.clips[question.audioStem];
        const src = clip
            ? relative(REVIEW_DIR, join(ROOT, 'public', clip.url.replace(/^\//, ''))).replace(/\\/g, '/')
            : '';
        const options = question.options
            .map(
                (option) =>
                    `<li class="${option.isCorrect ? 'ok' : ''}">${escapeHtml(option.translations.ru.text)} <span class="en">${escapeHtml(option.translations.en.text)}</span></li>`,
            )
            .join('');
        const meta = question.metadata ?? {};
        const source = typeof meta.source === 'string' ? meta.source : '';
        return `<section>
  <h2>${index + 1}. ${escapeHtml(question.translations.ru.text)} <span class="en">${escapeHtml(question.translations.en.text)}</span> <span class="tag">${question.difficulty}</span></h2>
  ${src ? `<audio controls preload="auto" src="${escapeHtml(src)}"></audio>` : '<p class="bad">клип не собран</p>'}
  <p class="meta">${escapeHtml(String(meta.track ?? '—'))} — ${escapeHtml(String(meta.composer ?? '—'))} · ${escapeHtml(String(meta.game ?? ''))}<br>
  ${escapeHtml(question.audio.sourceFile)} · с ${question.audio.startSeconds} с, ${question.audio.durationSeconds} с${clip ? ` · ${(clip.bytes / 1024).toFixed(0)} КБ · ${clip.loudnessLufs ?? '?'} LUFS` : ''}
  ${source ? `<br><a href="${escapeHtml(source)}">${escapeHtml(source)}</a>` : ''}</p>
  <ul>${options}</ul>
</section>`;
    });
    const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ревью клипов — ${escapeHtml(name)}</title>
<style>
body{font:15px/1.45 system-ui,sans-serif;max-width:860px;margin:24px auto;padding:0 16px;color:#1d2125;background:#f6f7f8}
section{background:#fff;border:1px solid #dde1e4;border-radius:10px;padding:14px 16px;margin:12px 0}
h2{font-size:16px;margin:0 0 10px}.en{color:#7a848c;font-weight:400}.tag{font:12px monospace;color:#7a848c}
audio{width:100%}.meta{color:#4b555c;font-size:13px}ul{margin:8px 0 0;padding-left:20px}
li.ok{color:#0b7a4b;font-weight:600}.bad{color:#b3261e}
</style></head><body>
<h1>Ревью клипов: ${escapeHtml(name)}</h1>
<p>Верный ответ — зелёным. Проверь: узнаётся ли трек, нет ли в клипе названия игры, ровная ли громкость. Таймкоды правятся в партии, потом <code>npm run audio:build -- --file=… --review</code>.</p>
${rows.join('\n')}
</body></html>
`;
    writeFileSync(pagePath, html);
    return pagePath;
}

function main(): void {
    const options = parseArgs(process.argv.slice(2));
    const batch = JSON.parse(readFileSync(options.batchPath, 'utf8')) as AudioBatch;
    if (batch.kind !== 'AUDIO_GUESS_BATCH') {
        throw new Error('Expected kind AUDIO_GUESS_BATCH');
    }

    const problems = batch.questions.flatMap((question) =>
        validateQuestion(question).map((error) => `${question.draftKey}: ${error}`),
    );
    const stems = batch.questions.map((question) => question.audioStem);
    const duplicate = stems.find((stem, index) => stems.indexOf(stem) !== index);
    if (duplicate) problems.push(`duplicate audioStem ${duplicate}`);
    if (problems.length > 0) {
        throw new Error(`Batch is invalid:\n  ${problems.join('\n  ')}`);
    }

    mkdirSync(OUT_DIR, { recursive: true });
    const manifest = readManifest();
    const workDir = join(tmpdir(), `gamemind-audio-${process.pid}`);
    mkdirSync(workDir, { recursive: true });

    let built = 0;
    let kept = 0;
    try {
        for (const question of batch.questions) {
            if (options.only && question.audioStem !== options.only) continue;

            const existing = manifest.clips[question.audioStem];
            const existingFile = existing
                ? join(ROOT, 'public', existing.url.replace(/^\//, ''))
                : null;
            if (
                !options.force &&
                existing &&
                sameInput(existing.input, question.audio) &&
                existingFile &&
                existsSync(existingFile)
            ) {
                kept += 1;
                log(`keep  ${question.audioStem} → ${existing.url}`);
                continue;
            }

            const sourcePath = resolve(ROOT, question.audio.sourceFile);
            if (!existsSync(sourcePath)) {
                throw new Error(`${question.draftKey}: source not found: ${question.audio.sourceFile}`);
            }

            const encoded = encodeClip(question, workDir);
            const sanitized = sanitizeQuizMp3(encoded);
            if (!sanitized.ok) {
                throw new Error(
                    `${question.draftKey}: clip rejected (${sanitized.problem}${sanitized.detail ? `: ${sanitized.detail}` : ''})`,
                );
            }

            const bytes = Buffer.from(sanitized.bytes);
            const sha256 = createHash('sha256').update(bytes).digest('hex');
            const url = `/media/audio/${sha256.slice(0, 16)}.mp3`;
            const outPath = join(ROOT, 'public', url.replace(/^\//, ''));
            writeFileSync(outPath, bytes);
            assertNoTags(outPath);
            const loudnessLufs = measureLoudness(outPath);

            manifest.clips[question.audioStem] = {
                url,
                sha256,
                bytes: bytes.length,
                durationMs: sanitized.inspection.durationMs,
                loudnessLufs,
                input: { ...question.audio },
            };
            built += 1;

            const loudnessNote =
                loudnessLufs !== null &&
                Math.abs(loudnessLufs - LOUDNESS.integrated) > LOUDNESS_WARN_LU
                    ? `  ⚠ loudness ${loudnessLufs} LUFS`
                    : '';
            log(
                `build ${question.audioStem} → ${url}  ${(bytes.length / 1024).toFixed(0)} KB, ` +
                    `${(sanitized.inspection.durationMs / 1000).toFixed(2)} s, ${loudnessLufs ?? '?'} LUFS` +
                    (sanitized.removed.length ? `, stripped ${sanitized.removed.join('+')}` : '') +
                    loudnessNote,
            );
        }
    } finally {
        rmSync(workDir, { recursive: true, force: true });
        writeManifest(manifest);
    }

    log(`Done. built=${built} kept=${kept}. Manifest: content/quiz-audio.manifest.json`);
    if (options.review) {
        log(`Review page: ${writeReviewPage(options.batchPath, batch, manifest)}`);
    }
}

try {
    main();
} catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
}
