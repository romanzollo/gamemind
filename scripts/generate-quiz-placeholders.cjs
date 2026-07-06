const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'public', 'quiz-images');

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
        to: '#312e81',
    },
    {
        file: 'hard/doom-1993.svg',
        title: 'DOOM (1993)',
        from: '#991b1b',
        to: '#1c1917',
    },
    {
        file: 'hard/tetris.svg',
        title: 'Tetris',
        from: '#0891b2',
        to: '#164e63',
    },
    {
        file: 'hard/metal-gear-solid.svg',
        title: 'Metal Gear Solid',
        from: '#4b5563',
        to: '#111827',
    },
];

function escapeXml(value) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

function buildSvg({ title, from, to }) {
    const safeTitle = escapeXml(title);

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720" role="img" aria-label="${safeTitle}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${from}" />
      <stop offset="100%" stop-color="${to}" />
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)" />
  <rect x="64" y="64" width="1152" height="592" rx="24" fill="rgb(0 0 0 / 0.18)" />
  <text x="640" y="330" fill="#f8fafc" font-size="54" font-family="system-ui,Segoe UI,sans-serif" text-anchor="middle" font-weight="700">${safeTitle}</text>
  <text x="640" y="400" fill="#cbd5e1" font-size="28" font-family="system-ui,Segoe UI,sans-serif" text-anchor="middle">GameMind placeholder</text>
</svg>
`;
}

function ensurePlaceholders({ log = true } = {}) {
    let created = 0;

    for (const item of PLACEHOLDERS) {
        const targetPath = path.join(ROOT, item.file);
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });

        if (!fs.existsSync(targetPath)) {
            fs.writeFileSync(targetPath, buildSvg(item), 'utf8');
            created += 1;
            if (log) {
                console.log(`Created ${path.relative(process.cwd(), targetPath)}`);
            }
        }
    }

    if (log && created === 0) {
        console.log('Quiz image placeholders already exist');
    }

    return created;
}

if (require.main === module) {
    ensurePlaceholders();
}

module.exports = { ensurePlaceholders, PLACEHOLDERS };
