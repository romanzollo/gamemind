const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'public', 'quiz-images');

/**
 * SVG placeholders for bootstrap only. Prefer real WebP from
 * `npm run images:optimize` — see docs/QUIZ_IMAGES.md.
 */
const PLACEHOLDERS = [
    {
        file: 'easy/super-mario-bros.svg',
        title: 'Super Mario Bros.',
        from: '#2563eb',
        to: '#1e3a8a',
    },
    {
        file: 'easy/legend-of-zelda.svg',
        title: 'The Legend of Zelda',
        from: '#16a34a',
        to: '#14532d',
    },
    {
        file: 'easy/pokemon-red-blue.svg',
        title: 'Pokémon Red / Blue',
        from: '#dc2626',
        to: '#7f1d1d',
    },
    {
        file: 'medium/the-witcher-3.svg',
        title: 'The Witcher 3',
        from: '#b45309',
        to: '#451a03',
    },
    {
        file: 'medium/elden-ring.svg',
        title: 'Elden Ring',
        from: '#ca8a04',
        to: '#3f3f46',
    },
    {
        file: 'medium/final-fantasy-vii.svg',
        title: 'Final Fantasy VII',
        from: '#7c3aed',
        to: '#4c1d95',
    },
    {
        file: 'hard/tetris.svg',
        title: 'Tetris',
        from: '#0ea5e9',
        to: '#0c4a6e',
    },
    {
        file: 'hard/doom-1993.svg',
        title: 'Doom (1993)',
        from: '#ef4444',
        to: '#7f1d1d',
    },
    {
        file: 'hard/metal-gear-solid.svg',
        title: 'Metal Gear Solid',
        from: '#64748b',
        to: '#1e293b',
    },
];

function buildSvg(item) {
    const safeTitle = item.title
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${item.from}" />
      <stop offset="100%" stop-color="${item.to}" />
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)" />
  <rect x="64" y="64" width="1152" height="592" rx="24" fill="rgb(0 0 0 / 0.18)" />
  <text x="640" y="330" fill="#f8fafc" font-size="54" font-family="system-ui,Segoe UI,sans-serif" text-anchor="middle" font-weight="700">${safeTitle}</text>
  <text x="640" y="400" fill="#cbd5e1" font-size="28" font-family="system-ui,Segoe UI,sans-serif" text-anchor="middle">GameMind placeholder</text>
</svg>
`;
}

function webpPathForSvg(svgRelativePath) {
    return path.join(ROOT, svgRelativePath.replace(/\.svg$/i, '.webp'));
}

/**
 * Prefer existing WebP screenshots. Only create SVG if WebP is missing
 * (bootstrap for fresh clones without optimized assets).
 */
function ensurePlaceholders({ log = true } = {}) {
    let created = 0;
    let webpReady = 0;

    for (const item of PLACEHOLDERS) {
        const webpPath = webpPathForSvg(item.file);
        if (fs.existsSync(webpPath)) {
            webpReady += 1;
            continue;
        }

        const targetPath = path.join(ROOT, item.file);
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });

        if (!fs.existsSync(targetPath)) {
            fs.writeFileSync(targetPath, buildSvg(item), 'utf8');
            created += 1;
            if (log) {
                console.log(`Created SVG fallback ${path.relative(process.cwd(), targetPath)}`);
            }
        }
    }

    if (log) {
        console.log(
            `Quiz images: ${webpReady} WebP ready, ${created} SVG fallback(s) created`,
        );
    }

    return { created, webpReady };
}

/**
 * Fail seed if IMAGE_GUESS questions point at missing public files.
 */
function assertPromptImageFilesExist(questions, { log = true } = {}) {
    const publicRoot = path.join(__dirname, '..', 'public');
    const missing = [];

    for (const question of questions) {
        if (question.type !== 'IMAGE_GUESS') {
            continue;
        }
        const url = question.promptImage?.url;
        if (!url || !url.startsWith('/')) {
            missing.push(`${question.id}: invalid promptImage.url`);
            continue;
        }
        const filePath = path.join(publicRoot, url.replace(/^\//, ''));
        if (!fs.existsSync(filePath)) {
            missing.push(`${question.id}: missing ${url}`);
        }
    }

    if (missing.length > 0) {
        throw new Error(
            `Missing quiz image files:\n- ${missing.join('\n- ')}\nRun: npm run images:optimize`,
        );
    }

    if (log) {
        console.log('Quiz IMAGE_GUESS prompt files exist on disk');
    }
}

if (require.main === module) {
    ensurePlaceholders();
}

module.exports = {
    ensurePlaceholders,
    assertPromptImageFilesExist,
    PLACEHOLDERS,
};
