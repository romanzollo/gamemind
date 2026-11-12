/**
 * Сборка иконок из src/app/icon.svg:
 * - src/app/favicon.ico (16, 32, 48 px);
 * - src/app/apple-icon.png (180 px) — иконка на экране iPhone;
 * - public/icons/icon-192.png и icon-512.png — для манифеста (src/app/manifest.ts).
 * Для apple / PWA плитка без скругления: система скругляет сама, а
 * прозрачные углы iOS залил бы чёрным.
 *
 * Зачем: браузеры и поисковые роботы (Яндекс) сами запрашивают /favicon.ico.
 * Без файла запрос уходит в маршрут [locale] и серверная функция рендерит 404
 * на каждый первый заход. Файл в src/app Next отдаёт как статику с CDN.
 *
 * ICO с PNG внутри (поддерживается всеми браузерами и Windows Vista+).
 * sharp не применяет @media (prefers-color-scheme) — берутся светлые цвета.
 * Перезапускать при смене icon.svg (редизайн знака):
 *   node scripts/build-favicon.cjs
 * Canon: docs/DECISIONS.md → Shared rate limit and favicon.ico.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SIZES = [16, 32, 48];
const root = path.resolve(__dirname, '..');
const svgPath = path.join(root, 'src/app/icon.svg');
const icoPath = path.join(root, 'src/app/favicon.ico');
const applePath = path.join(root, 'src/app/apple-icon.png');
const pwaDir = path.join(root, 'public/icons');
const PWA_SIZES = [192, 512];

async function renderPng(svg, size) {
    // density: рендерим векторно сразу в нужный размер, без даунскейла растра.
    return sharp(svg, { density: Math.ceil((72 * size) / 32) })
        .resize(size, size)
        .png({ compressionLevel: 9 })
        .toBuffer();
}

function packIco(images) {
    const headerSize = 6;
    const entrySize = 16;
    const header = Buffer.alloc(headerSize);
    header.writeUInt16LE(0, 0); // reserved
    header.writeUInt16LE(1, 2); // type: icon
    header.writeUInt16LE(images.length, 4);

    let offset = headerSize + entrySize * images.length;
    const entries = images.map(({ size, png }) => {
        const entry = Buffer.alloc(entrySize);
        entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
        entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
        entry.writeUInt8(0, 2); // palette colors
        entry.writeUInt8(0, 3); // reserved
        entry.writeUInt16LE(1, 4); // color planes
        entry.writeUInt16LE(32, 6); // bits per pixel
        entry.writeUInt32LE(png.length, 8);
        entry.writeUInt32LE(offset, 12);
        offset += png.length;
        return entry;
    });

    return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

async function main() {
    const svg = fs.readFileSync(svgPath);
    const images = [];
    for (const size of SIZES) {
        images.push({ size, png: await renderPng(svg, size) });
    }
    const ico = packIco(images);
    fs.writeFileSync(icoPath, ico);
    console.log(
        `favicon.ico: ${SIZES.join('/')} px, ${ico.length} bytes → ${path.relative(root, icoPath)}`,
    );

    // Квадратная плитка без скругления (rx="7" → 0) для apple и PWA.
    const squareSvg = Buffer.from(
        svg.toString('utf8').replace('rx="7"', 'rx="0"'),
    );
    if (squareSvg.equals(svg)) {
        throw new Error('icon.svg: плитка с rx="7" не найдена — обнови скрипт');
    }

    fs.writeFileSync(applePath, await renderPng(squareSvg, 180));
    console.log(`apple-icon.png: 180 px → ${path.relative(root, applePath)}`);

    fs.mkdirSync(pwaDir, { recursive: true });
    for (const size of PWA_SIZES) {
        const out = path.join(pwaDir, `icon-${size}.png`);
        fs.writeFileSync(out, await renderPng(squareSvg, size));
        console.log(`icon-${size}.png → ${path.relative(root, out)}`);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
