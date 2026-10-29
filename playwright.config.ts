/**
 * Playwright — smoke горячего пути квиза: Классика (3 вопроса) и Блиц MIX
 * от старта до результата, под служебным игроком.
 *
 * Где гоняется:
 * - CI: `.github/workflows/prod-smoke.yml` после каждого прод-деплоя Vercel,
 *   против https://www.game-mind.ru (SMOKE_BASE_URL);
 * - локально: против запущенного `npm run dev` (по умолчанию localhost:3000).
 *
 * Учётные данные — только env SMOKE_EMAIL / SMOKE_PASSWORD: отдельный игрок
 * с `isTestAccount` (скрыт из рейтингов). Локально — из `.env` через
 * @next/env, как их читает сам Next.
 *
 * Артефакты: репозиторий публичный, артефакты Actions может скачать любой.
 * Поэтому в CI trace/video выключены (в trace попадают cookie сессии и тело
 * POST логина), а у проекта входа своя outputDir, которую workflow не
 * выгружает. Наружу — только скриншоты страниц квиза при падении.
 *
 * Таймауты с запасом: холодный старт функции + Neon на проде, а dev на
 * Windows ещё медленнее (2–10 с на hop). Не повод поднимать таймауты в коде
 * приложения — см. docs/QUIZ_NEON_HOT_PATH.md.
 *
 * См. DECISIONS.md → Prod smoke after deploy; docs/TESTING.md.
 */

import { loadEnvConfig } from '@next/env';
import { defineConfig, devices } from '@playwright/test';

import { SMOKE_AUTH_STATE_PATH } from './e2e/smoke-env';

loadEnvConfig(process.cwd());

const isCI = Boolean(process.env.CI);

export default defineConfig({
    testDir: 'e2e',
    outputDir: 'test-results',
    timeout: 120_000,
    expect: { timeout: 45_000 },
    retries: isCI ? 1 : 0,
    // Один игрок, один Neon: сценарии по очереди, без гонок за Direct-клиент.
    workers: 1,
    forbidOnly: isCI,
    reporter: isCI ? [['list'], ['github']] : [['list']],
    use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.SMOKE_BASE_URL ?? 'http://localhost:3000',
        locale: 'ru-RU',
        navigationTimeout: 60_000,
        actionTimeout: 15_000,
        trace: isCI ? 'off' : 'retain-on-failure',
        video: 'off',
        screenshot: 'only-on-failure',
    },
    projects: [
        {
            name: 'setup',
            testMatch: /auth\.setup\.ts$/,
            // Страница входа с email на скриншоте не должна попасть в артефакт.
            outputDir: 'test-results-private',
            use: { screenshot: 'off', trace: 'off' },
        },
        {
            name: 'smoke',
            testMatch: /\.spec\.ts$/,
            dependencies: ['setup'],
            use: { storageState: SMOKE_AUTH_STATE_PATH },
        },
    ],
});
