/**
 * Перевод WebP в public/quiz-images со slug-имён на имена-хеши.
 *
 * Обычный режим: для каждого `{folder}/{slug}.webp` кладёт рядом копию
 * `{folder}/{hash}.webp` и записывает пару в content/quiz-images.manifest.json.
 * Старые файлы остаются: прод-БД и уже начатые партии ещё ссылаются на них,
 * пока не прошёл scripts/migrate-quiz-image-urls.cjs.
 *
 * --prune-legacy: удаляет slug-файлы, у которых в манифесте есть хеш-копия
 * с теми же байтами. Запускать только когда миграция URL на dev и prod
 * показала 0 старых ссылок — иначе старые разборы и партии получат 404.
 *
 * Usage:
 *   node scripts/hash-quiz-images.cjs --dry-run
 *   node scripts/hash-quiz-images.cjs
 *   node scripts/hash-quiz-images.cjs --prune-legacy --dry-run
 *   node scripts/hash-quiz-images.cjs --prune-legacy
 *
 * Новые картинки сразу получают хеш-имя в npm run images:optimize —
 * этот скрипт нужен для файлов, которые уже лежат в public/.
 */

const fs = require('fs');
const path = require('path');

const {
    DIFFICULTY_FOLDERS,
    IMAGE_DIR,
    filePathForUrl,
    hashImageBytes,
    hashedUrlFor,
    isHashedQuizImageUrl,
    logicalWebpUrl,
    readManifest,
    writeManifest,
} = require('./quiz-image-manifest.cjs');

function listLegacyFiles() {
    const files = [];
    for (const folder of DIFFICULTY_FOLDERS) {
        const dir = path.join(IMAGE_DIR, folder);
        if (!fs.existsSync(dir)) continue;
        for (const entry of fs.readdirSync(dir).sort()) {
            if (!entry.endsWith('.webp')) continue;
            const url = `/quiz-images/${folder}/${entry}`;
            if (isHashedQuizImageUrl(url)) continue;
            if (!logicalWebpUrl(url)) {
                throw new Error(`Unexpected file name (use lowercase slug): ${url}`);
            }
            files.push({ folder, url, filePath: path.join(dir, entry) });
        }
    }
    return files;
}

function adopt(dryRun) {
    const manifest = readManifest();
    const files = listLegacyFiles();
    const byHash = new Map();
    let added = 0;
    let changed = 0;
    let same = 0;

    for (const file of files) {
        const bytes = fs.readFileSync(file.filePath);
        const hashedUrl = hashedUrlFor(file.folder, bytes);
        const previous = manifest.images[file.url];

        const twin = byHash.get(hashedUrl);
        if (twin) {
            console.warn(`  warn  ${file.url} has the same bytes as ${twin}`);
        }
        byHash.set(hashedUrl, file.url);

        if (previous === hashedUrl) {
            same += 1;
        } else {
            if (previous) {
                changed += 1;
                console.log(`  upd   ${file.url} → ${hashedUrl} (was ${previous})`);
            } else {
                added += 1;
                console.log(`  add   ${file.url} → ${hashedUrl}`);
            }
            manifest.images[file.url] = hashedUrl;
        }

        const target = filePathForUrl(hashedUrl);
        if (!dryRun && !fs.existsSync(target)) {
            fs.copyFileSync(file.filePath, target);
        }
    }

    if (!dryRun && added + changed > 0) {
        writeManifest(manifest);
    }

    console.log(
        `\nDone${dryRun ? ' (dry-run)' : ''}. slug files=${files.length} added=${added} changed=${changed} unchanged=${same}`,
    );
    if (added + changed > 0) {
        console.log('Next: node scripts/migrate-quiz-image-urls.cjs --dry-run');
    }
}

function pruneLegacy(dryRun) {
    const manifest = readManifest();
    const files = listLegacyFiles();
    const problems = [];
    let removed = 0;

    for (const file of files) {
        const hashedUrl = manifest.images[file.url];
        if (!hashedUrl) {
            problems.push(`${file.url}: not in manifest (run without --prune-legacy first)`);
            continue;
        }
        const target = filePathForUrl(hashedUrl);
        if (!fs.existsSync(target)) {
            problems.push(`${file.url}: hashed copy ${hashedUrl} is missing`);
            continue;
        }
        const legacyHash = hashImageBytes(fs.readFileSync(file.filePath));
        if (!hashedUrl.endsWith(`/${legacyHash}.webp`)) {
            problems.push(`${file.url}: bytes differ from ${hashedUrl} (re-run adopt)`);
            continue;
        }
        if (!dryRun) fs.unlinkSync(file.filePath);
        removed += 1;
        console.log(`  ${dryRun ? 'plan' : 'rm'}    ${file.url}`);
    }

    for (const problem of problems) console.error(`  skip  ${problem}`);
    console.log(
        `\nDone${dryRun ? ' (dry-run)' : ''}. ${dryRun ? 'would remove' : 'removed'}=${removed} skipped=${problems.length}`,
    );
    if (problems.length > 0) process.exitCode = 1;
}

function main() {
    const argv = process.argv.slice(2);
    const dryRun = argv.includes('--dry-run');
    if (argv.includes('--prune-legacy')) {
        pruneLegacy(dryRun);
    } else {
        adopt(dryRun);
    }
}

main();
