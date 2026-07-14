/**
 * Optimize raw quiz screenshots into public/quiz-images WebP assets.
 *
 * Usage:
 *   npm run images:optimize
 *   npm run images:optimize -- --dry-run
 *   npm run images:optimize -- --quality 75 --fit inside
 *
 * Spec: docs/QUIZ_IMAGES.md
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INPUT_DIR = path.join(ROOT, 'raw-quiz-images');
const OUTPUT_DIR = path.join(ROOT, 'public', 'quiz-images');

const DIFFICULTIES = ['easy', 'medium', 'hard'];
const INPUT_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.tif', '.tiff'];

/** Expected stems aligned with scripts/seed-questions.cjs IMAGE_GUESS paths. */
const EXPECTED = {
    easy: ['super-mario-bros', 'legend-of-zelda', 'pokemon-red-blue'],
    medium: ['the-witcher-3', 'elden-ring', 'final-fantasy-vii'],
    hard: ['tetris', 'doom-1993', 'metal-gear-solid'],
};

const WARN_BYTES = 200 * 1024;

function parseArgs(argv) {
    const options = {
        dryRun: false,
        width: 1280,
        height: 720,
        quality: 80,
        // Keep full frame — quiz UI uses object-contain. Avoid cropping at export.
        fit: 'inside',
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--dry-run') {
            options.dryRun = true;
            continue;
        }
        if (arg === '--width' && argv[i + 1]) {
            options.width = Number(argv[++i]);
            continue;
        }
        if (arg === '--height' && argv[i + 1]) {
            options.height = Number(argv[++i]);
            continue;
        }
        if (arg === '--quality' && argv[i + 1]) {
            options.quality = Number(argv[++i]);
            continue;
        }
        if (arg === '--fit' && argv[i + 1]) {
            options.fit = argv[++i];
            continue;
        }
        if (arg === '--help' || arg === '-h') {
            options.help = true;
        }
    }

    return options;
}

function assertOptions(options) {
    if (!Number.isFinite(options.width) || options.width < 64) {
        throw new Error(`Invalid --width: ${options.width}`);
    }
    if (!Number.isFinite(options.height) || options.height < 64) {
        throw new Error(`Invalid --height: ${options.height}`);
    }
    if (!Number.isFinite(options.quality) || options.quality < 1 || options.quality > 100) {
        throw new Error(`Invalid --quality: ${options.quality}`);
    }
    if (options.fit !== 'cover' && options.fit !== 'inside') {
        throw new Error(`Invalid --fit: ${options.fit} (use cover|inside)`);
    }
}

function findSourceFile(difficulty, stem) {
    const dir = path.join(INPUT_DIR, difficulty);
    if (!fs.existsSync(dir)) {
        return null;
    }

    for (const ext of INPUT_EXTENSIONS) {
        const candidate = path.join(dir, `${stem}${ext}`);
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    // Case-insensitive match on Windows-friendly scan
    const entries = fs.readdirSync(dir);
    const lowerStem = stem.toLowerCase();
    for (const entry of entries) {
        const parsed = path.parse(entry);
        if (parsed.name.toLowerCase() !== lowerStem) {
            continue;
        }
        if (!INPUT_EXTENSIONS.includes(parsed.ext.toLowerCase())) {
            continue;
        }
        return path.join(dir, entry);
    }

    return null;
}

function formatKb(bytes) {
    return `${(bytes / 1024).toFixed(1)} KB`;
}

function printHelp() {
    console.log(`Optimize quiz screenshots → WebP

Usage:
  node scripts/optimize-quiz-images.cjs [options]

Options:
  --dry-run          Do not write files
  --width <n>        Output width (default 1280)
  --height <n>       Output height (default 720)
  --quality <1-100>  WebP quality (default 80)
  --fit cover|inside Resize mode (default inside — no crop)

Input:  raw-quiz-images/{easy|medium|hard}/{slug}.png|jpg|...
Output: public/quiz-images/{difficulty}/{slug}.webp

See docs/QUIZ_IMAGES.md for the full checklist.`);
}

async function preparePipeline(sharp, source) {
    let pipeline = sharp(source).rotate();
    const before = await pipeline.metadata();

    // Remove baked-in black letterboxing common on scraped retro shots.
    try {
        const trimmed = await pipeline
            .clone()
            .trim({ threshold: 18 })
            .toBuffer({ resolveWithObject: true });
        if (trimmed.info.width >= 32 && trimmed.info.height >= 32) {
            pipeline = sharp(trimmed.data);
        }
    } catch {
        pipeline = sharp(source).rotate();
    }

    const meta = await pipeline.metadata();
    const isPixelArt =
        (meta.width ?? before.width ?? 0) <= 360 &&
        (meta.height ?? before.height ?? 0) <= 360;

    return { pipeline, meta, isPixelArt };
}

async function resizeForQuiz(sharp, pipeline, meta, isPixelArt, options) {
    const width = meta.width ?? options.width;
    const height = meta.height ?? options.height;

    if (isPixelArt) {
        // Upscale tiny NES/GB frames for readability; nearest keeps pixels crisp.
        const minDisplayWidth = 960;
        const scale = Math.min(
            options.width / width,
            options.height / height,
            Math.max(minDisplayWidth / width, 1),
            6,
        );
        const targetWidth = Math.max(1, Math.round(width * scale));
        const targetHeight = Math.max(1, Math.round(height * scale));

        return pipeline.resize(targetWidth, targetHeight, {
            kernel: sharp.kernel.nearest,
        });
    }

    if (options.fit === 'cover') {
        return pipeline.resize({
            width: options.width,
            height: options.height,
            fit: 'cover',
            position: 'centre',
            withoutEnlargement: false,
        });
    }

    return pipeline.resize({
        width: options.width,
        height: options.height,
        fit: 'inside',
        withoutEnlargement: false,
    });
}

async function optimizeOne(sharp, difficulty, stem, options) {
    const source = findSourceFile(difficulty, stem);
    if (!source) {
        return { status: 'missing', difficulty, stem };
    }

    const outDir = path.join(OUTPUT_DIR, difficulty);
    const outPath = path.join(outDir, `${stem}.webp`);

    if (options.dryRun) {
        return {
            status: 'dry-run',
            difficulty,
            stem,
            source,
            outPath,
        };
    }

    fs.mkdirSync(outDir, { recursive: true });

    const { pipeline, meta, isPixelArt } = await preparePipeline(sharp, source);
    const resized = await resizeForQuiz(sharp, pipeline, meta, isPixelArt, options);
    const output = await resized.webp({ quality: options.quality, effort: 4 }).toFile(outPath);

    const { size } = fs.statSync(outPath);
    return {
        status: 'written',
        difficulty,
        stem,
        source,
        outPath,
        bytes: size,
        outputWidth: output.width,
        outputHeight: output.height,
        pixelArt: isPixelArt,
    };
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        printHelp();
        return;
    }

    assertOptions(options);

    let sharp;
    try {
        sharp = require('sharp');
    } catch {
        console.error(
            'Missing dependency: sharp.\nRun: npm install\n(sharp is listed in devDependencies)',
        );
        process.exitCode = 1;
        return;
    }

    console.log(
        `optimize-quiz-images: ${options.width}×${options.height} WebP q=${options.quality} fit=${options.fit}${options.dryRun ? ' (dry-run)' : ''}`,
    );
    console.log(`input:  ${INPUT_DIR}`);
    console.log(`output: ${OUTPUT_DIR}`);
    console.log('');

    const results = [];

    for (const difficulty of DIFFICULTIES) {
        for (const stem of EXPECTED[difficulty]) {
            // eslint-disable-next-line no-await-in-loop -- sequential keeps logs readable
            const result = await optimizeOne(sharp, difficulty, stem, options);
            results.push(result);
        }
    }

    // Also process any extra files in raw folders not in EXPECTED
    for (const difficulty of DIFFICULTIES) {
        const dir = path.join(INPUT_DIR, difficulty);
        if (!fs.existsSync(dir)) {
            continue;
        }
        const expectedSet = new Set(EXPECTED[difficulty]);
        for (const entry of fs.readdirSync(dir)) {
            const parsed = path.parse(entry);
            if (!INPUT_EXTENSIONS.includes(parsed.ext.toLowerCase())) {
                continue;
            }
            if (expectedSet.has(parsed.name) || expectedSet.has(parsed.name.toLowerCase())) {
                continue;
            }
            // eslint-disable-next-line no-await-in-loop
            const result = await optimizeOne(sharp, difficulty, parsed.name, options);
            results.push(result);
        }
    }

    let written = 0;
    let missing = 0;
    let dry = 0;

    for (const result of results) {
        if (result.status === 'missing') {
            missing += 1;
            console.log(`  skip  [${result.difficulty}] ${result.stem} — no source in raw-quiz-images/`);
            continue;
        }
        if (result.status === 'dry-run') {
            dry += 1;
            console.log(`  plan  ${result.source} → ${result.outPath}`);
            continue;
        }
        written += 1;
        const warn = result.bytes > WARN_BYTES ? ' ⚠ >200KB' : '';
        const dims =
            result.outputWidth && result.outputHeight
                ? ` ${result.outputWidth}×${result.outputHeight}`
                : '';
        const mode = result.pixelArt ? ' pixel-art' : '';
        console.log(
            `  ok    ${path.relative(ROOT, result.outPath)} (${formatKb(result.bytes)}${dims}${mode})${warn}`,
        );
    }

    console.log('');
    console.log(
        `Done. written=${written} dry-run=${dry} missing=${missing} (expected checklist: 9)`,
    );

    if (written > 0) {
        console.log(
            'Next: switch seed/admin URLs from .svg → .webp, then npm run db:seed (or update admin).',
        );
    }
    if (missing > 0) {
        console.log('Checklist: docs/QUIZ_IMAGES.md');
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
