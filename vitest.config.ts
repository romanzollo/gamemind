/**
 * Конфиг Vitest для unit-тестов чистых доменных правил.
 *
 * Зачем отдельный файл: Next.js и Vitest — разные рантаймы.
 * Здесь только то, что нужно тестам (alias `@/` как в tsconfig),
 * без Prisma / Neon / Playwright.
 *
 * См. docs/TESTING.md Phase A; DECISIONS → Automated Testing Adoption.
 */

import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Только файлы рядом с кодом: *.test.ts / *.test.tsx
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
        // Не тянуть Next/app в suite случайно
        environment: 'node',
        // Пока тестов нет — не падать с code 1 (удобно на шаге установки)
        passWithNoTests: true,
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
